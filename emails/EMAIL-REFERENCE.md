# TaekUp Email Templates Reference

All emails use the **TaekUp** brand with cyan theme (#06b6d4) and the slogan **"EVERY STEP TAKES YOU UP"**.

---

## 📧 Owner/Club Trial Emails

### 1. Welcome Email
**File:** `welcome-email.html`  
**Subject:** `Welcome to TaekUp - Your 14-Day Trial Has Started!`  
**Trigger:** When club owner signs up  
**Variables:**
- `{{ownerName}}` - Owner's name
- `{{clubName}}` - Club name
- `{{ctaUrl}}` - Link to dashboard/setup wizard
- `{{unsubscribeUrl}}` - Unsubscribe link
- `{{privacyUrl}}` - Privacy policy link

---

### 2. Day 3 Check-in
**File:** `day-3-checkin.html`  
**Subject:** `How's it going? Upload your student list yet?`  
**Trigger:** 3 days after signup  
**Variables:**
- `{{ownerName}}` - Owner's name
- `{{dashboardUrl}}` - Link to dashboard (Students → Import)
- `{{helpUrl}}` - Link to help center/quick start guide
- `{{unsubscribeUrl}}` - Unsubscribe link
- `{{privacyUrl}}` - Privacy policy link

---

### 3. Day 7 Mid-Trial
**File:** `day-7-mid-trial.html`  
**Subject:** `7 Days Left - Have You Tried AI Feedback?`  
**Trigger:** 7 days after signup  
**Variables:**
- `{{ownerName}}` - Owner's name
- `{{aiFeedbackUrl}}` - Link to AI feedback feature
- `{{unsubscribeUrl}}` - Unsubscribe link
- `{{privacyUrl}}` - Privacy policy link

---

### 4. Trial Ending Soon (3 Days Left)
**File:** `trial-ending-soon.html`  
**Subject:** `⏰ Only {{daysLeft}} Days Left on Your Trial`  
**Trigger:** 3 days before trial ends  
**Variables:**
- `{{ownerName}}` - Owner's name
- `{{clubName}}` - Club name
- `{{daysLeft}}` - Days remaining (e.g., "3")
- `{{upgradeUrl}}` - Link to pricing/upgrade page
- `{{unsubscribeUrl}}` - Unsubscribe link
- `{{privacyUrl}}` - Privacy policy link

---

### 5. Trial Expired (Lockout)
**File:** `day-14-trial-expired.html`  
**Subject:** `Your Trial Has Ended - Upgrade to Keep Access`  
**Trigger:** Trial expiration date  
**Variables:**
- `{{ownerName}}` - Owner's name
- `{{clubName}}` - Club name
- `{{upgradeUrl}}` - Link to pricing/upgrade page
- `{{unsubscribeUrl}}` - Unsubscribe link
- `{{privacyUrl}}` - Privacy policy link

---

## 👨‍🏫 Coach/Admin Functional Emails

### 6. Coach Invite
**File:** `coach-invite.html`  
**Subject:** `{{ownerName}} invited you to join {{clubName}} as a Coach`  
**Trigger:** When owner adds a new coach  
**Variables:**
- `{{coachName}}` - Coach's name
- `{{coachEmail}}` - Coach's email address
- `{{ownerName}}` - Owner's name (who sent invite)
- `{{clubName}}` - Club name
- `{{tempPassword}}` - Temporary password
- `{{loginUrl}}` - Link to login page
- `{{privacyUrl}}` - Privacy policy link

---

### 7. Reset Password
**File:** `reset-password.html`  
**Subject:** `Reset Your TaekUp Password`  
**Trigger:** When user requests password reset  
**Variables:**
- `{{userName}}` - User's name
- `{{resetUrl}}` - Password reset link (expires in 1 hour)
- `{{privacyUrl}}` - Privacy policy link

---

### 8. New Student Added
**File:** `new-student-added.html`  
**Subject:** `New Student Added: {{studentName}}`  
**Trigger:** When a new student is added to the system  
**Variables:**
- `{{studentName}}` - Student's name
- `{{clubName}}` - Club name
- `{{beltLevel}}` - Current belt level
- `{{studentAge}}` - Student's age
- `{{parentName}}` - Parent's name
- `{{studentProfileUrl}}` - Link to student profile

---

### 9. Monthly Revenue Report
**File:** `monthly-revenue-report.html`  
**Subject:** `💰 Your {{monthName}} Earnings Report - ${{totalEarnings}}`  
**Trigger:** 1st of each month  
**Variables:**
- `{{monthName}}` - Month name (e.g., "November")
- `{{totalEarnings}}` - Total earnings (e.g., "350")
- `{{premiumParents}}` - Number of Premium parent subscribers
- `{{newThisMonth}}` - New Premium subscribers this month
- `{{dashboardUrl}}` - Link to full revenue dashboard
- `{{unsubscribeUrl}}` - Unsubscribe link
- `{{privacyUrl}}` - Privacy policy link

---

## 👨‍👩‍👧 Parent Engagement Emails

### 10. Parent Welcome
**File:** `parent-welcome.html`  
**Subject:** `Track {{studentName}}'s Progress on TaekUp`  
**Trigger:** When parent account is created  
**Variables:**
- `{{parentName}}` - Parent's name
- `{{studentName}}` - Student's name
- `{{clubName}}` - Club name
- `{{parentPortalUrl}}` - Link to parent portal
- `{{unsubscribeUrl}}` - Unsubscribe link
- `{{privacyUrl}}` - Privacy policy link

---

### 11. Class Feedback (The "Wow" Email)
**File:** `class-feedback.html`  
**Subject:** `⭐ {{studentName}} Did Great Today!`  
**Trigger:** After class (sent by coach)  
**Variables:**
- `{{parentName}}` - Parent's name
- `{{studentName}}` - Student's name
- `{{clubName}}` - Club name
- `{{className}}` - Class name (e.g., "Little Tigers")
- `{{classDate}}` - Date of class (e.g., "Dec 4, 2025")
- `{{feedbackText}}` - Coach's feedback message
- `{{coachName}}` - Coach's name
- `{{highlights}}` - Bullet points of highlights
- `{{studentProfileUrl}}` - Link to student profile
- `{{shareUrl}}` - Social media share link
- `{{unsubscribeUrl}}` - Unsubscribe link
- `{{privacyUrl}}` - Privacy policy link

---

### 12. Belt Promotion
**File:** `belt-promotion.html`  
**Subject:** `🎊 Congratulations! {{studentName}} Earned a New Belt!`  
**Trigger:** When belt promotion is recorded  
**Variables:**
- `{{studentName}}` - Student's name
- `{{beltColor}}` - New belt color (e.g., "YELLOW")
- `{{clubName}}` - Club name
- `{{promotionDate}}` - Date of promotion
- `{{totalXp}}` - Total XP earned
- `{{classesAttended}}` - Number of classes attended
- `{{monthsTrained}}` - Months of training
- `{{certificateUrl}}` - Link to download certificate
- `{{shareUrl}}` - Social media share link
- `{{unsubscribeUrl}}` - Unsubscribe link
- `{{privacyUrl}}` - Privacy policy link

---

### 13. Attendance Alert (Retention Radar)
**File:** `attendance-alert.html`  
**Subject:** `We Miss {{studentName}}! Is Everything Okay?`  
**Trigger:** 14+ days since last class  
**Variables:**
- `{{parentName}}` - Parent's name
- `{{studentName}}` - Student's name
- `{{clubName}}` - Club name
- `{{daysSinceLastClass}}` - Number of days (e.g., "14")
- `{{scheduleUrl}}` - Link to class schedule
- `{{unsubscribeUrl}}` - Unsubscribe link
- `{{privacyUrl}}` - Privacy policy link

---

### 14. Birthday Wish
**File:** `birthday-wish.html`  
**Subject:** `🎂 Happy Birthday, {{studentName}}!`  
**Trigger:** On student's birthday  
**Variables:**
- `{{studentName}}` - Student's name
- `{{clubName}}` - Club name
- `{{unsubscribeUrl}}` - Unsubscribe link
- `{{privacyUrl}}` - Privacy policy link

---

## 🔗 Common Link Variables

| Variable | Description | Example URL |
|----------|-------------|-------------|
| `{{dashboardUrl}}` | Admin dashboard | `https://app.mytaek.com/dashboard` |
| `{{loginUrl}}` | Login page | `https://app.mytaek.com/login` |
| `{{upgradeUrl}}` | Pricing/upgrade page | `https://app.mytaek.com/pricing` |
| `{{parentPortalUrl}}` | Parent portal | `https://app.mytaek.com/parent` |
| `{{studentProfileUrl}}` | Student profile | `https://app.mytaek.com/student/{{studentId}}` |
| `{{scheduleUrl}}` | Class schedule | `https://app.mytaek.com/schedule` |
| `{{helpUrl}}` | Help center | `https://help.mytaek.com` |
| `{{resetUrl}}` | Password reset (tokenized) | `https://app.mytaek.com/reset?token={{token}}` |
| `{{certificateUrl}}` | Certificate download | `https://app.mytaek.com/certificate/{{id}}` |
| `{{shareUrl}}` | Social share page | `https://app.mytaek.com/share/{{id}}` |
| `{{unsubscribeUrl}}` | Email preferences | `https://app.mytaek.com/email-preferences` |
| `{{privacyUrl}}` | Privacy policy | `https://mytaek.com/privacy` |

---

## 📨 SendGrid Integration

### Recommended Email Categories

| Category | Emails |
|----------|--------|
| **Trial Sequence** | welcome, day-3, day-7, trial-ending, trial-expired |
| **Transactional** | reset-password, coach-invite, new-student-added |
| **Engagement** | class-feedback, belt-promotion, birthday-wish |
| **Retention** | attendance-alert, monthly-revenue-report |
| **Marketing** | parent-welcome (can include Premium upsell) |

### SendGrid Dynamic Templates
Upload each HTML file to SendGrid as a Dynamic Template, then use the template ID in your code:

```javascript
const msg = {
  to: 'parent@email.com',
  from: 'hello@mytaek.com',
  templateId: 'd-xxxxxxxxxxxxx', // Your SendGrid template ID
  dynamicTemplateData: {
    parentName: 'John',
    studentName: 'Sarah',
    clubName: 'Elite Taekwondo',
    // ... other variables
  }
};
```

---

## ✅ Checklist

- [ ] Upload all templates to SendGrid
- [ ] Create dynamic template IDs
- [ ] Set up email triggers in backend
- [ ] Test mobile responsiveness
- [ ] Verify all links work correctly
- [ ] Set up unsubscribe handling
