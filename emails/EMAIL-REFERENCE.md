# TaekUp Email Templates Reference

All emails use the **TaekUp** brand with cyan theme (#06b6d4) and the slogan **"EVERY STEP TAKES YOU UP"**.

**From Email:** `noreply@mytaek.com` (configured via SendGrid connection)

---

## 🚀 Quick Start - How to Use

### Step 1: Create Dynamic Templates in SendGrid
1. Go to SendGrid Dashboard → Email API → Dynamic Templates
2. Click "Create a Dynamic Template"
3. Name it (e.g., "Welcome Email")
4. Click "Add Version" → "Code Editor"
5. Paste the HTML from the corresponding email file
6. Copy the Template ID (starts with `d-`)

### Step 2: Update Template IDs
Open `server/services/emailService.ts` and replace the template IDs:

```typescript
export const EMAIL_TEMPLATES = {
  WELCOME: 'd-abc123yourtemplateid',
  DAY_3_CHECKIN: 'd-abc123yourtemplateid',
  // ... update all template IDs
};
```

### Step 3: Send Emails from Your Code

```typescript
import emailService from './services/emailService';

// Send welcome email when club signs up
await emailService.sendWelcomeEmail('owner@email.com', {
  ownerName: 'Master Hamed',
  clubName: 'Elite Taekwondo Academy'
});

// Send class feedback after class
await emailService.sendClassFeedbackEmail('parent@email.com', {
  parentName: 'John',
  studentName: 'Sarah',
  clubName: 'Elite Taekwondo',
  className: 'Little Tigers',
  classDate: 'Dec 4, 2025',
  feedbackText: 'Sarah showed excellent focus today and nailed her turning kick!',
  coachName: 'Coach Kim',
  highlights: '✨ Perfect form on front kicks<br>✨ Helped younger students<br>✨ Earned 50 XP',
  studentId: 'stu_123',
  feedbackId: 'fb_456'
});
```

---

## 📧 Owner/Club Trial Emails

### 1. Welcome Email
**File:** `welcome-email.html`  
**Template Key:** `EMAIL_TEMPLATES.WELCOME`  
**Subject:** `Welcome to TaekUp - Your 14-Day Trial Has Started!`  
**Trigger:** When club owner signs up  
**Function:** `sendWelcomeEmail(to, { ownerName, clubName })`

---

### 2. Day 3 Check-in
**File:** `day-3-checkin.html`  
**Template Key:** `EMAIL_TEMPLATES.DAY_3_CHECKIN`  
**Subject:** `How's it going? Upload your student list yet?`  
**Trigger:** 3 days after signup  
**Function:** `sendDay3CheckinEmail(to, { ownerName })`

---

### 3. Day 7 Mid-Trial
**File:** `day-7-mid-trial.html`  
**Template Key:** `EMAIL_TEMPLATES.DAY_7_MID_TRIAL`  
**Subject:** `7 Days Left - Have You Tried AI Feedback?`  
**Trigger:** 7 days after signup  
**Function:** `sendDay7MidTrialEmail(to, { ownerName })`

---

### 4. Trial Ending Soon (3 Days Left)
**File:** `trial-ending-soon.html`  
**Template Key:** `EMAIL_TEMPLATES.TRIAL_ENDING_SOON`  
**Subject:** `⏰ Only {{daysLeft}} Days Left on Your Trial`  
**Trigger:** 3 days before trial ends  
**Function:** `sendTrialEndingSoonEmail(to, { ownerName, clubName, daysLeft })`

---

### 5. Trial Expired (Lockout)
**File:** `day-14-trial-expired.html`  
**Template Key:** `EMAIL_TEMPLATES.TRIAL_EXPIRED`  
**Subject:** `Your Trial Has Ended - Upgrade to Keep Access`  
**Trigger:** Trial expiration date  
**Function:** `sendTrialExpiredEmail(to, { ownerName, clubName })`

---

## 👨‍🏫 Coach/Admin Functional Emails

### 6. Coach Invite
**File:** `coach-invite.html`  
**Template Key:** `EMAIL_TEMPLATES.COACH_INVITE`  
**Subject:** `{{ownerName}} invited you to join {{clubName}} as a Coach`  
**Trigger:** When owner adds a new coach  
**Function:** `sendCoachInviteEmail(to, { coachName, coachEmail, ownerName, clubName, tempPassword })`

---

### 7. Reset Password
**File:** `reset-password.html`  
**Template Key:** `EMAIL_TEMPLATES.RESET_PASSWORD`  
**Subject:** `Reset Your TaekUp Password`  
**Trigger:** When user requests password reset  
**Function:** `sendResetPasswordEmail(to, { userName, resetToken })`

---

### 8. New Student Added
**File:** `new-student-added.html`  
**Template Key:** `EMAIL_TEMPLATES.NEW_STUDENT_ADDED`  
**Subject:** `New Student Added: {{studentName}}`  
**Trigger:** When a new student is added to the system  
**Function:** `sendNewStudentAddedEmail(to, { studentName, clubName, beltLevel, studentAge, parentName, studentId })`

---

### 9. Monthly Revenue Report
**File:** `monthly-revenue-report.html`  
**Template Key:** `EMAIL_TEMPLATES.MONTHLY_REVENUE_REPORT`  
**Subject:** `💰 Your {{monthName}} Earnings Report - ${{totalEarnings}}`  
**Trigger:** 1st of each month  
**Function:** `sendMonthlyRevenueReportEmail(to, { monthName, totalEarnings, premiumParents, newThisMonth })`

---

## 👨‍👩‍👧 Parent Engagement Emails

### 10. Parent Welcome
**File:** `parent-welcome.html`  
**Template Key:** `EMAIL_TEMPLATES.PARENT_WELCOME`  
**Subject:** `Track {{studentName}}'s Progress on TaekUp`  
**Trigger:** When parent account is created  
**Function:** `sendParentWelcomeEmail(to, { parentName, studentName, clubName, studentId })`

---

### 11. Class Feedback (The "Wow" Email)
**File:** `class-feedback.html`  
**Template Key:** `EMAIL_TEMPLATES.CLASS_FEEDBACK`  
**Subject:** `⭐ {{studentName}} Did Great Today!`  
**Trigger:** After class (sent by coach)  
**Function:** `sendClassFeedbackEmail(to, { parentName, studentName, clubName, className, classDate, feedbackText, coachName, highlights, studentId, feedbackId })`

---

### 12. Belt Promotion
**File:** `belt-promotion.html`  
**Template Key:** `EMAIL_TEMPLATES.BELT_PROMOTION`  
**Subject:** `🎊 Congratulations! {{studentName}} Earned a New Belt!`  
**Trigger:** When belt promotion is recorded  
**Function:** `sendBeltPromotionEmail(to, { studentName, beltColor, clubName, promotionDate, totalXp, classesAttended, monthsTrained, promotionId })`

---

### 13. Attendance Alert (Retention Radar)
**File:** `attendance-alert.html`  
**Template Key:** `EMAIL_TEMPLATES.ATTENDANCE_ALERT`  
**Subject:** `We Miss {{studentName}}! Is Everything Okay?`  
**Trigger:** 14+ days since last class  
**Function:** `sendAttendanceAlertEmail(to, { parentName, studentName, clubName, daysSinceLastClass })`

---

### 14. Birthday Wish
**File:** `birthday-wish.html`  
**Template Key:** `EMAIL_TEMPLATES.BIRTHDAY_WISH`  
**Subject:** `🎂 Happy Birthday, {{studentName}}!`  
**Trigger:** On student's birthday  
**Function:** `sendBirthdayWishEmail(to, { studentName, clubName })`

---

## 🔗 Auto-Injected Link Variables

These links are automatically added to every email:

| Variable | Description | Value |
|----------|-------------|-------|
| `{{unsubscribeUrl}}` | Email preferences | `{APP_URL}/email-preferences` |
| `{{privacyUrl}}` | Privacy policy | `{APP_URL}/privacy` |
| `{{dashboardUrl}}` | Admin dashboard | `{APP_URL}/dashboard` |
| `{{loginUrl}}` | Login page | `{APP_URL}/login` |
| `{{upgradeUrl}}` | Pricing page | `{APP_URL}/pricing` |
| `{{helpUrl}}` | Help center | `{APP_URL}/help` |

Set `APP_URL` environment variable to your domain (e.g., `https://app.mytaek.com`)

---

## 📨 SendGrid Setup Summary

### Template IDs to Create

| Email Type | Template Name |
|------------|---------------|
| `WELCOME` | Welcome Email |
| `DAY_3_CHECKIN` | Day 3 Check-in |
| `DAY_7_MID_TRIAL` | Day 7 Mid-Trial |
| `TRIAL_ENDING_SOON` | Trial Ending Soon |
| `TRIAL_EXPIRED` | Trial Expired |
| `COACH_INVITE` | Coach Invite |
| `RESET_PASSWORD` | Reset Password |
| `NEW_STUDENT_ADDED` | New Student Added |
| `MONTHLY_REVENUE_REPORT` | Monthly Revenue Report |
| `PARENT_WELCOME` | Parent Welcome |
| `CLASS_FEEDBACK` | Class Feedback |
| `BELT_PROMOTION` | Belt Promotion |
| `ATTENDANCE_ALERT` | Attendance Alert |
| `BIRTHDAY_WISH` | Birthday Wish |

---

## ✅ Setup Checklist

- [ ] Create all 14 Dynamic Templates in SendGrid
- [ ] Copy each HTML template content to SendGrid
- [ ] Update `EMAIL_TEMPLATES` object with template IDs
- [ ] Set `APP_URL` environment variable
- [ ] Test each email type
- [ ] Set up cron jobs for scheduled emails (day-3, day-7, trial-ending, monthly-report, birthday)
