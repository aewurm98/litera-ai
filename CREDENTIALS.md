# Litera.ai — Demo Credentials

> **Internal use only.** This file is not served to end users.

## Default Password (All Staff Accounts)

```
Password123!
```

## Default Patient PIN

```
1234
```

---

## Super Admin

| Username | Name           | Role        | Tenant     |
|----------|----------------|-------------|------------|
| admin    | Angela Torres  | Super Admin | All        |

---

## Riverside Community Health

| Username                | Name             | Role(s)           |
|-------------------------|------------------|-------------------|
| riverside_admin         | Dr. James Park   | Admin, Clinician  |
| nurse                   | Maria Chen, RN   | Clinician         |
| riverside_interpreter   | Luis Reyes, CMI  | Interpreter (ES, FR, RU) |

---

## Lakeside Family Medicine

| Username                | Name              | Role(s)           |
|-------------------------|-------------------|-------------------|
| lakeside_admin          | Dr. Rachel Torres | Admin, Clinician  |
| lakeside_nurse          | Sarah Kim, NP     | Clinician         |
| lakeside_interpreter    | Nadia Hassan, CMI | Interpreter (AR, HI, VI) |

---

## Patient Portal Access

Patients verify identity using **last name + date of birth + PIN (1234)**.

Magic links are sent via email. In simulation mode, all patient emails redirect to the tenant admin's recovery email.

---

## Notes

- Staff passwords can be changed via the "Forgot password?" flow on the login page (requires a recovery email set in Settings).
- New staff accounts are created through the team invitation system in Settings (admin-only).
- The demo reset (`/api/admin/reset-demo`) preserves staff accounts (passwords, recovery emails, roles) and only refreshes patients and care plans.
