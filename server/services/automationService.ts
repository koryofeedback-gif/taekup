import postgres from 'postgres';

const db = postgres(process.env.DATABASE_URL!);

interface AutomationRule {
  id: string;
  rule_type: string;
  name: string;
  is_active: boolean;
  conditions: any;
  actions: any;
  email_template: string;
  slack_enabled: boolean;
  email_enabled: boolean;
}

export class AutomationService {
  private slackWebhookUrl: string | undefined;

  constructor() {
    this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  }

  async runScheduledAutomations() {
    console.log('[Automation] Running scheduled automations...');
    
    try {
      await this.checkTrialReminders();
      await this.checkHealthScoreAlerts();
      await this.checkFailedPayments();
    } catch (error) {
      console.error('[Automation] Error running automations:', error);
    }
  }

  async checkTrialReminders() {
    const rules = await db`
      SELECT * FROM automation_rules 
      WHERE rule_type = 'trial_reminder' AND is_active = true
    `;

    for (const rule of rules) {
      const conditions = rule.conditions as any;
      const daysBefore = conditions?.days_before_trial_end || 3;

      const clubs = await db`
        SELECT c.*, 
          EXTRACT(DAY FROM c.trial_end - NOW()) as days_until_expiry
        FROM clubs c
        WHERE c.trial_status = 'active'
          AND c.trial_end IS NOT NULL
          AND EXTRACT(DAY FROM c.trial_end - NOW()) BETWEEN ${daysBefore - 0.5} AND ${daysBefore + 0.5}
          AND NOT EXISTS (
            SELECT 1 FROM automation_executions ae
            WHERE ae.rule_id = ${rule.id}::uuid
              AND ae.club_id = c.id
              AND ae.executed_at > NOW() - INTERVAL '1 day'
          )
      `;

      for (const club of clubs) {
        await this.executeAutomation(rule, club);
      }
    }
  }

  async checkHealthScoreAlerts() {
    const rules = await db`
      SELECT * FROM automation_rules 
      WHERE rule_type = 'health_score_email' AND is_active = true
    `;

    for (const rule of rules) {
      const conditions = rule.conditions as any;
      const threshold = conditions?.health_score_below || 40;

      const clubs = await db`
        WITH club_health AS (
          SELECT 
            c.id,
            c.name,
            c.owner_email,
            c.trial_status,
            c.status,
            EXTRACT(DAY FROM NOW() - COALESCE(
              (SELECT MAX(created_at) FROM activity_log WHERE club_id = c.id), 
              c.created_at
            )) as days_inactive,
            (SELECT COUNT(*) FROM students WHERE club_id = c.id) as student_count
          FROM clubs c
          WHERE c.status = 'active' OR c.trial_status = 'active'
        )
        SELECT *,
          GREATEST(0, 100 - (days_inactive * 5) - 
            CASE WHEN student_count = 0 THEN 30 ELSE 0 END) as health_score
        FROM club_health
        WHERE GREATEST(0, 100 - (days_inactive * 5) - 
          CASE WHEN student_count = 0 THEN 30 ELSE 0 END) < ${threshold}
          AND NOT EXISTS (
            SELECT 1 FROM automation_executions ae
            WHERE ae.rule_id = ${rule.id}::uuid
              AND ae.club_id = club_health.id
              AND ae.executed_at > NOW() - INTERVAL '7 days'
          )
      `;

      for (const club of clubs) {
        await this.executeAutomation(rule, club);
      }
    }
  }

  async checkFailedPayments() {
    const rules = await db`
      SELECT * FROM automation_rules 
      WHERE rule_type = 'payment_dunning' AND is_active = true
    `;

    for (const rule of rules) {
      const conditions = rule.conditions as any;
      const attemptNumber = conditions?.attempt_number || 1;

      const failedPayments = await db`
        SELECT 
          p.*,
          c.name as club_name,
          c.owner_email,
          c.id as club_id,
          COALESCE(pra.attempt_number, 0) as current_attempts
        FROM payments p
        JOIN clubs c ON c.id = p.club_id
        LEFT JOIN payment_recovery_attempts pra ON pra.payment_id = p.id
        WHERE p.status IN ('failed', 'unpaid')
          AND COALESCE(pra.attempt_number, 0) = ${attemptNumber - 1}
          AND NOT EXISTS (
            SELECT 1 FROM automation_executions ae
            WHERE ae.rule_id = ${rule.id}::uuid
              AND ae.club_id = c.id
              AND ae.executed_at > NOW() - INTERVAL '2 days'
          )
      `;

      for (const payment of failedPayments) {
        await this.executeAutomation(rule, { 
          ...payment, 
          id: payment.club_id 
        });

        await db`
          INSERT INTO payment_recovery_attempts (club_id, payment_id, stripe_invoice_id, attempt_number, email_sent, email_sent_at)
          VALUES (${payment.club_id}::uuid, ${payment.id}::uuid, ${payment.stripe_invoice_id}, ${attemptNumber}, true, NOW())
        `;
      }
    }
  }

  async executeAutomation(rule: any, targetData: any) {
    console.log(`[Automation] Executing rule: ${rule.name} for ${targetData.name || targetData.id}`);

    try {
      const actions = rule.actions as any;
      const actionsTaken: string[] = [];

      if (rule.email_enabled && actions?.send_email) {
        await this.sendAutomationEmail(rule.email_template, targetData);
        actionsTaken.push(`email_sent:${rule.email_template}`);
      }

      if (rule.slack_enabled && this.slackWebhookUrl) {
        await this.sendSlackNotification(rule, targetData);
        actionsTaken.push('slack_notification');
      }

      await db`
        INSERT INTO automation_executions (rule_id, club_id, trigger_data, actions_taken, success)
        VALUES (
          ${rule.id}::uuid, 
          ${targetData.id}::uuid, 
          ${JSON.stringify(targetData)}::jsonb, 
          ${JSON.stringify(actionsTaken)}::jsonb, 
          true
        )
      `;

      await db`
        UPDATE automation_rules 
        SET last_triggered_at = NOW(), trigger_count = trigger_count + 1
        WHERE id = ${rule.id}::uuid
      `;

    } catch (error: any) {
      console.error(`[Automation] Error executing rule ${rule.name}:`, error);

      await db`
        INSERT INTO automation_executions (rule_id, club_id, trigger_data, success, error)
        VALUES (
          ${rule.id}::uuid, 
          ${targetData.id}::uuid, 
          ${JSON.stringify(targetData)}::jsonb, 
          false,
          ${error.message}
        )
      `;
    }
  }

  async sendAutomationEmail(templateKey: string, data: any) {
    const sgMail = await import('@sendgrid/mail');
    const apiKey = process.env.SENDGRID_API_KEY;
    
    if (!apiKey) {
      console.log('[Automation] SendGrid not configured, skipping email');
      return;
    }

    sgMail.default.setApiKey(apiKey);

    const templateMap: Record<string, string> = {
      'trial_ending_soon': 'd-trial-ending',
      'win_back': 'd-189dede22ae74ea697199ccbd9629bdb',
      'churn_risk': 'd-f9a587c97a9d4ed18c87212a140f9c53',
      'payment_failed': 'd-payment-failed'
    };

    const templateId = templateMap[templateKey];
    if (!templateId) {
      console.log(`[Automation] Unknown template: ${templateKey}`);
      return;
    }

    try {
      await sgMail.default.send({
        to: data.owner_email,
        from: process.env.SENDGRID_FROM_EMAIL || 'hello@mytaek.com',
        templateId,
        dynamicTemplateData: {
          club_name: data.name,
          owner_name: data.owner_name || 'Club Owner',
          days_remaining: data.days_until_expiry,
          health_score: data.health_score
        }
      });
      console.log(`[Automation] Email sent to ${data.owner_email}`);
    } catch (error) {
      console.error('[Automation] Email send error:', error);
      throw error;
    }
  }

  async sendSlackNotification(rule: any, data: any) {
    if (!this.slackWebhookUrl) return;

    const message = this.formatSlackMessage(rule, data);

    try {
      await fetch(this.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
      console.log('[Automation] Slack notification sent');
    } catch (error) {
      console.error('[Automation] Slack send error:', error);
    }
  }

  formatSlackMessage(rule: any, data: any) {
    const emoji = {
      'health_score_email': ':warning:',
      'trial_reminder': ':clock3:',
      'payment_dunning': ':moneybag:',
      'churn_alert': ':rotating_light:',
      'conversion_alert': ':tada:',
      'signup_alert': ':wave:'
    }[rule.rule_type] || ':bell:';

    return {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} ${rule.name}`,
            emoji: true
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Club:*\n${data.name || 'Unknown'}`
            },
            {
              type: 'mrkdwn',
              text: `*Email:*\n${data.owner_email || 'N/A'}`
            }
          ]
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Automation triggered at ${new Date().toISOString()}`
            }
          ]
        }
      ]
    };
  }

  async triggerEvent(eventType: string, data: any) {
    const ruleTypeMap: Record<string, string> = {
      'subscription_canceled': 'churn_alert',
      'trial_converted': 'conversion_alert',
      'new_signup': 'signup_alert'
    };

    const ruleType = ruleTypeMap[eventType];
    if (!ruleType) return;

    const rules = await db`
      SELECT * FROM automation_rules 
      WHERE rule_type = ${ruleType} AND is_active = true
    `;

    for (const rule of rules) {
      await this.executeAutomation(rule, data);
    }
  }
}

export const automationService = new AutomationService();
