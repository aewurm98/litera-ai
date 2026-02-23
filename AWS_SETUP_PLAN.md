# Litera.ai — AWS Backend Setup Plan

**Created**: 2026-02-23
**Purpose**: Step-by-step guide to set up every AWS service needed to run Litera.ai in production, from local tool installation through to a fully running containerized application.

**Region**: `ca-central-1` (Canada Central) — required for PHIPA data residency compliance.
**ECR Repository**: `379245767730.dkr.ecr.ca-central-1.amazonaws.com/litera-app-repo` (already created)

---

## Table of Contents

1. [Prerequisites & Local Tools](#1-prerequisites--local-tools)
2. [AWS Account & IAM Setup](#2-aws-account--iam-setup)
3. [Build & Push Docker Image to ECR](#3-build--push-docker-image-to-ecr)
4. [Set Up RDS PostgreSQL](#4-set-up-rds-postgresql)
5. [Store Secrets in AWS Secrets Manager](#5-store-secrets-in-aws-secrets-manager)
6. [Set Up VPC & Networking](#6-set-up-vpc--networking)
7. [Set Up ECS Fargate Cluster & Service](#7-set-up-ecs-fargate-cluster--service)
8. [Set Up Application Load Balancer (ALB) & TLS](#8-set-up-application-load-balancer-alb--tls)
9. [DNS & Domain Configuration](#9-dns--domain-configuration)
10. [Database Migration](#10-database-migration)
11. [Verify & Smoke Test](#11-verify--smoke-test)
12. [Operational Essentials](#12-operational-essentials)
13. [Cost Estimate](#13-cost-estimate)
14. [Architecture Diagram](#14-architecture-diagram)

---

## 1. Prerequisites & Local Tools

Install these on your development machine before starting.

### 1.1 Install AWS CLI v2

```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify
aws --version
# Should show aws-cli/2.x.x
```

### 1.2 Install Docker Desktop

- **macOS / Windows**: Download from https://www.docker.com/products/docker-desktop
- **Linux**: Follow https://docs.docker.com/engine/install/

```bash
# Verify
docker --version
# Should show Docker version 24+ or 27+
```

### 1.3 Install Node.js 20+

```bash
# Using nvm (recommended)
nvm install 20
nvm use 20

# Verify
node --version
# Should show v20.x.x
```

### 1.4 Configure AWS CLI

```bash
aws configure
# AWS Access Key ID: <your-access-key>
# AWS Secret Access Key: <your-secret-key>
# Default region name: ca-central-1
# Default output format: json
```

You'll get these credentials from IAM (next section). If you already have a root or admin user with access keys, you can use those temporarily to bootstrap, then create a proper IAM user.

---

## 2. AWS Account & IAM Setup

### 2.1 AWS Account

If you don't have one yet:
1. Go to https://aws.amazon.com and create an account
2. Enable MFA on the root account immediately
3. Set up a billing alert (e.g., $50/month threshold) in **Billing > Budgets**

### 2.2 Create an IAM Admin User (for CLI access)

1. Go to **IAM > Users > Create user**
2. User name: `litera-admin`
3. Select **Attach policies directly**
4. Attach: `AdministratorAccess` (for initial setup — you can scope this down later)
5. Create the user
6. Go to **Security credentials > Create access key**
7. Choose "Command Line Interface (CLI)"
8. Save the Access Key ID and Secret Access Key securely

Now run `aws configure` with these credentials (see step 1.4).

### 2.3 Create an ECS Task Execution Role

This role allows ECS tasks to pull images from ECR and read secrets.

```bash
# Create the trust policy
cat > ecs-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create the role
aws iam create-role \
  --role-name litera-ecs-task-execution-role \
  --assume-role-policy-document file://ecs-trust-policy.json

# Attach the standard ECS task execution policy (ECR pull + CloudWatch logs)
aws iam attach-role-policy \
  --role-name litera-ecs-task-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Attach Secrets Manager read access (for injecting secrets into containers)
aws iam attach-role-policy \
  --role-name litera-ecs-task-execution-role \
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite

# Clean up the temp file
rm ecs-trust-policy.json
```

---

## 3. Build & Push Docker Image to ECR

Your ECR repository (`litera-app-repo`) is already created. Here's the full process.

### 3.1 Authenticate Docker to ECR

```bash
aws ecr get-login-password --region ca-central-1 | \
  docker login --username AWS --password-stdin \
  379245767730.dkr.ecr.ca-central-1.amazonaws.com
```

You should see: `Login Succeeded`

**Troubleshooting**:
- "Unable to locate credentials" → Run `aws configure` (step 1.4)
- "An error occurred (AccessDeniedException)" → Your IAM user needs `ecr:GetAuthorizationToken` permission

### 3.2 Build the Docker Image

From the repo root (where `Dockerfile` is):

```bash
cd /path/to/litera-ai
docker build -t litera-app-repo .
```

This will:
1. Install system dependencies (poppler-utils for PDF processing, build tools for bcrypt)
2. Install npm packages
3. Build client (Vite → `dist/public/`) and server (esbuild → `dist/index.cjs`)
4. Prune dev dependencies
5. Create a lean production image

**Expected build time**: 3-8 minutes depending on your machine and internet speed.

### 3.3 Tag the Image

```bash
docker tag litera-app-repo:latest \
  379245767730.dkr.ecr.ca-central-1.amazonaws.com/litera-app-repo:latest
```

### 3.4 Push to ECR

```bash
docker push \
  379245767730.dkr.ecr.ca-central-1.amazonaws.com/litera-app-repo:latest
```

### 3.5 Verify the Push

```bash
aws ecr describe-images \
  --repository-name litera-app-repo \
  --region ca-central-1
```

You should see your image listed with the `latest` tag.

### 3.6 (Optional) Test Locally Before Pushing

To verify the container works before pushing:

```bash
docker run -p 5000:5000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://user:pass@host:5432/literadb" \
  -e SESSION_SECRET="test-secret-for-local-only" \
  -e APP_URL="http://localhost:5000" \
  -e OPENAI_API_KEY="sk-..." \
  litera-app-repo:latest
```

Visit http://localhost:5000 — you should see the Litera login page.

---

## 4. Set Up RDS PostgreSQL

### 4.1 Create the Database via Console

1. Go to **RDS > Create database**
2. Choose **Standard create**
3. Engine: **PostgreSQL**, version **16.x**
4. Template: **Free tier** (for initial setup) or **Production** (for pilot)
5. Settings:
   - DB instance identifier: `litera-db`
   - Master username: `litera_admin`
   - Master password: Generate and **save securely**
6. Instance: `db.t3.micro` (free tier) or `db.t3.small` (pilot)
7. Storage: 20 GB gp3, enable storage autoscaling
8. Connectivity:
   - VPC: Default VPC (or your custom VPC — see section 6)
   - **Public access: No** (the ECS tasks will connect via private networking)
   - Security group: Create new → name it `litera-db-sg`
9. Database authentication: Password authentication
10. Additional configuration:
    - Initial database name: `literadb`
    - Enable automated backups: **Yes**, retention **35 days**
    - Enable encryption: **Yes** (AES-256, AWS managed key)
    - Enable deletion protection: **Yes** (for production)

### 4.2 Note the Connection Endpoint

After the database is created (takes ~5 minutes), go to the RDS instance details and copy the **Endpoint**, e.g.:

```
litera-db.abc123xyz.ca-central-1.rds.amazonaws.com
```

Your `DATABASE_URL` will be:
```
postgresql://litera_admin:<password>@litera-db.abc123xyz.ca-central-1.rds.amazonaws.com:5432/literadb?sslmode=require
```

### 4.3 Configure Security Group

The RDS security group (`litera-db-sg`) should allow inbound traffic on port **5432** only from your ECS tasks' security group (you'll create this in section 7). For now, note the security group ID.

---

## 5. Store Secrets in AWS Secrets Manager

Store all sensitive environment variables in Secrets Manager so they're never hardcoded or visible in task definitions.

### 5.1 Generate Secrets

```bash
# Session secret (64 random bytes as hex)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Internal API secret (32 random bytes as hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5.2 Create the Secret

```bash
aws secretsmanager create-secret \
  --name litera/production \
  --region ca-central-1 \
  --secret-string '{
    "DATABASE_URL": "postgresql://litera_admin:<password>@litera-db.abc123xyz.ca-central-1.rds.amazonaws.com:5432/literadb?sslmode=require",
    "SESSION_SECRET": "<generated-64-char-hex>",
    "OPENAI_API_KEY": "sk-...",
    "RESEND_API_KEY": "re_...",
    "RESEND_FROM_EMAIL": "Litera Health <care@yourdomain.com>",
    "APP_URL": "https://litera.yourdomain.com",
    "INTERNAL_API_SECRET": "<generated-32-char-hex>"
  }'
```

Replace all `<placeholder>` values with your actual credentials.

### 5.3 Note the Secret ARN

```bash
aws secretsmanager describe-secret \
  --secret-id litera/production \
  --region ca-central-1 \
  --query 'ARN' --output text
```

Save this ARN — you'll need it for the ECS task definition.

---

## 6. Set Up VPC & Networking

If you're using the **Default VPC**, you can skip most of this — the default VPC has public subnets already. For production, a custom VPC with private subnets is recommended.

### 6.1 Using Default VPC (Simpler — Good for Initial Setup)

```bash
# Get your default VPC ID
aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --region ca-central-1 \
  --query 'Vpcs[0].VpcId' --output text

# Get the subnet IDs in the default VPC
aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=<vpc-id>" \
  --region ca-central-1 \
  --query 'Subnets[*].SubnetId' --output text
```

Note the VPC ID and at least 2 subnet IDs (in different AZs, needed for the ALB).

### 6.2 Create Security Groups

**ALB Security Group** (allows public internet traffic):

```bash
aws ec2 create-security-group \
  --group-name litera-alb-sg \
  --description "Litera ALB - allow HTTP/HTTPS from internet" \
  --vpc-id <vpc-id> \
  --region ca-central-1

# Allow HTTP (for redirect to HTTPS)
aws ec2 authorize-security-group-ingress \
  --group-id <alb-sg-id> \
  --protocol tcp --port 80 --cidr 0.0.0.0/0 \
  --region ca-central-1

# Allow HTTPS
aws ec2 authorize-security-group-ingress \
  --group-id <alb-sg-id> \
  --protocol tcp --port 443 --cidr 0.0.0.0/0 \
  --region ca-central-1
```

**ECS Task Security Group** (allows traffic only from ALB):

```bash
aws ec2 create-security-group \
  --group-name litera-ecs-sg \
  --description "Litera ECS tasks - allow traffic from ALB only" \
  --vpc-id <vpc-id> \
  --region ca-central-1

# Allow port 5000 from ALB security group only
aws ec2 authorize-security-group-ingress \
  --group-id <ecs-sg-id> \
  --protocol tcp --port 5000 \
  --source-group <alb-sg-id> \
  --region ca-central-1
```

**Update RDS Security Group** to allow ECS tasks:

```bash
aws ec2 authorize-security-group-ingress \
  --group-id <rds-sg-id> \
  --protocol tcp --port 5432 \
  --source-group <ecs-sg-id> \
  --region ca-central-1
```

---

## 7. Set Up ECS Fargate Cluster & Service

### 7.1 Create the ECS Cluster

```bash
aws ecs create-cluster \
  --cluster-name litera-cluster \
  --region ca-central-1
```

### 7.2 Create a CloudWatch Log Group

```bash
aws logs create-log-group \
  --log-group-name /ecs/litera-app \
  --region ca-central-1
```

### 7.3 Register the Task Definition

Create a file `ecs-task-definition.json`:

```json
{
  "family": "litera-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::379245767730:role/litera-ecs-task-execution-role",
  "containerDefinitions": [
    {
      "name": "litera-app",
      "image": "379245767730.dkr.ecr.ca-central-1.amazonaws.com/litera-app-repo:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 5000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "5000" }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "<secret-arn>:DATABASE_URL::"
        },
        {
          "name": "SESSION_SECRET",
          "valueFrom": "<secret-arn>:SESSION_SECRET::"
        },
        {
          "name": "OPENAI_API_KEY",
          "valueFrom": "<secret-arn>:OPENAI_API_KEY::"
        },
        {
          "name": "RESEND_API_KEY",
          "valueFrom": "<secret-arn>:RESEND_API_KEY::"
        },
        {
          "name": "RESEND_FROM_EMAIL",
          "valueFrom": "<secret-arn>:RESEND_FROM_EMAIL::"
        },
        {
          "name": "APP_URL",
          "valueFrom": "<secret-arn>:APP_URL::"
        },
        {
          "name": "INTERNAL_API_SECRET",
          "valueFrom": "<secret-arn>:INTERNAL_API_SECRET::"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/litera-app",
          "awslogs-region": "ca-central-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:5000/api/env-info || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

Replace `<secret-arn>` with the ARN from step 5.3.

```bash
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition.json \
  --region ca-central-1
```

### 7.4 Create the ECS Service

(Do this AFTER setting up the ALB in section 8, since you need the target group ARN.)

```bash
aws ecs create-service \
  --cluster litera-cluster \
  --service-name litera-app-service \
  --task-definition litera-app \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["<subnet-1>", "<subnet-2>"],
      "securityGroups": ["<ecs-sg-id>"],
      "assignPublicIp": "ENABLED"
    }
  }' \
  --load-balancers '[
    {
      "targetGroupArn": "<target-group-arn>",
      "containerName": "litera-app",
      "containerPort": 5000
    }
  ]' \
  --region ca-central-1
```

Replace `<subnet-1>`, `<subnet-2>`, `<ecs-sg-id>`, and `<target-group-arn>` with your actual values.

> **Note**: `assignPublicIp: ENABLED` is needed in public subnets so Fargate tasks can pull ECR images and reach external APIs (OpenAI, Resend). In a private subnet setup, you'd use a NAT Gateway instead.

---

## 8. Set Up Application Load Balancer (ALB) & TLS

### 8.1 Request a TLS Certificate (ACM)

```bash
aws acm request-certificate \
  --domain-name litera.yourdomain.com \
  --validation-method DNS \
  --region ca-central-1
```

Note the **Certificate ARN** from the output. Then:
1. Go to **ACM > Certificates** in the console
2. Click on the pending certificate
3. Copy the CNAME record name and value
4. Add that CNAME to your DNS provider
5. Wait for validation (usually 5-30 minutes)

### 8.2 Create the ALB

```bash
aws elbv2 create-load-balancer \
  --name litera-alb \
  --subnets <subnet-1> <subnet-2> \
  --security-groups <alb-sg-id> \
  --scheme internet-facing \
  --type application \
  --region ca-central-1
```

Note the **ALB ARN** and **DNS name** from the output.

### 8.3 Create a Target Group

```bash
aws elbv2 create-target-group \
  --name litera-tg \
  --protocol HTTP \
  --port 5000 \
  --vpc-id <vpc-id> \
  --target-type ip \
  --health-check-path /api/env-info \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --region ca-central-1
```

Note the **Target Group ARN** — you'll use this in the ECS service creation (step 7.4).

### 8.4 Create HTTPS Listener

```bash
aws elbv2 create-listener \
  --load-balancer-arn <alb-arn> \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=<acm-certificate-arn> \
  --default-actions Type=forward,TargetGroupArn=<target-group-arn> \
  --region ca-central-1
```

### 8.5 Create HTTP → HTTPS Redirect Listener

```bash
aws elbv2 create-listener \
  --load-balancer-arn <alb-arn> \
  --protocol HTTP \
  --port 80 \
  --default-actions '[{
    "Type": "redirect",
    "RedirectConfig": {
      "Protocol": "HTTPS",
      "Port": "443",
      "StatusCode": "HTTP_301"
    }
  }]' \
  --region ca-central-1
```

---

## 9. DNS & Domain Configuration

### 9.1 Point Your Domain to the ALB

Add a CNAME (or Route 53 Alias) record:

```
litera.yourdomain.com → <alb-dns-name>
```

The ALB DNS name looks like: `litera-alb-123456789.ca-central-1.elb.amazonaws.com`

If using **Route 53**:
```bash
# Create a hosted zone (if not already done)
aws route53 create-hosted-zone \
  --name yourdomain.com \
  --caller-reference $(date +%s)

# Create an alias record pointing to the ALB
# (Easiest to do this in the Route 53 console — select Alias → Application Load Balancer → ca-central-1 → your ALB)
```

### 9.2 Email DNS (for Resend)

Make sure your sending domain has these DNS records (get the exact values from your Resend dashboard at https://resend.com/domains):

| Type | Name | Value |
|------|------|-------|
| TXT | `yourdomain.com` | `v=spf1 include:amazonses.com ~all` |
| CNAME | `resend._domainkey.yourdomain.com` | `<provided by Resend>` |
| TXT | `_dmarc.yourdomain.com` | `v=DMARC1; p=quarantine;` |

---

## 10. Database Migration

### 10.1 Push Schema to New RDS

From a machine that can reach RDS (or temporarily allow your IP in the RDS security group):

```bash
export DATABASE_URL="postgresql://litera_admin:<password>@litera-db.abc123xyz.ca-central-1.rds.amazonaws.com:5432/literadb?sslmode=require"

# Push the Drizzle schema (creates all tables)
npx drizzle-kit push
```

### 10.2 (Optional) Migrate Data from Replit

If you have production data to migrate from Replit's Neon database:

```bash
# Export from Replit (run in Replit shell)
pg_dump "$DATABASE_URL" --no-owner --no-acls > litera_backup.sql

# Import into RDS (from your local machine or a bastion host)
psql "$NEW_DATABASE_URL" < litera_backup.sql
```

### 10.3 First Startup Behavior

If the database is empty on first startup, the app automatically seeds demo data (2 tenants, sample users, 10 patients). This is useful for verifying everything works. You can delete demo data later via the admin UI or by setting `DEMO_MODE=false`.

---

## 11. Verify & Smoke Test

Once the ECS service is running and the ALB is routing traffic:

### 11.1 Check ECS Service Health

```bash
# Check service status
aws ecs describe-services \
  --cluster litera-cluster \
  --services litera-app-service \
  --region ca-central-1 \
  --query 'services[0].{status:status,running:runningCount,desired:desiredCount}'

# Check task logs
aws logs tail /ecs/litera-app --region ca-central-1 --follow
```

### 11.2 Test the Endpoints

```bash
# Health check
curl https://litera.yourdomain.com/api/env-info
# Expected: {"isDemoMode":false,"isProduction":true}

# Login page
curl -s -o /dev/null -w "%{http_code}" https://litera.yourdomain.com
# Expected: 200
```

### 11.3 Functional Smoke Test

1. Log in as admin (demo credentials if seeded, or your real credentials)
2. Create a test care plan (upload a PDF)
3. Verify AI extraction/simplification works (tests OpenAI connectivity)
4. Send a test email to a patient (tests Resend connectivity)
5. Access the patient portal via the emailed link
6. Submit a check-in (traffic light)
7. Check the analytics page for data

---

## 12. Operational Essentials

### 12.1 Deploying Updates

When you push code changes, rebuild and redeploy:

```bash
# Build new image
docker build -t litera-app-repo .

# Tag and push
docker tag litera-app-repo:latest \
  379245767730.dkr.ecr.ca-central-1.amazonaws.com/litera-app-repo:latest
docker push \
  379245767730.dkr.ecr.ca-central-1.amazonaws.com/litera-app-repo:latest

# Force ECS to pull the new image
aws ecs update-service \
  --cluster litera-cluster \
  --service litera-app-service \
  --force-new-deployment \
  --region ca-central-1
```

### 12.2 Scaling

```bash
# Scale to 2 tasks (for availability)
aws ecs update-service \
  --cluster litera-cluster \
  --service litera-app-service \
  --desired-count 2 \
  --region ca-central-1
```

### 12.3 Viewing Logs

```bash
# Tail live logs
aws logs tail /ecs/litera-app --region ca-central-1 --follow

# Search logs for errors
aws logs filter-log-events \
  --log-group-name /ecs/litera-app \
  --filter-pattern "ERROR" \
  --region ca-central-1
```

### 12.4 Updating Secrets

```bash
aws secretsmanager update-secret \
  --secret-id litera/production \
  --secret-string '{ ... updated JSON ... }' \
  --region ca-central-1

# Then restart the ECS service to pick up new secrets
aws ecs update-service \
  --cluster litera-cluster \
  --service litera-app-service \
  --force-new-deployment \
  --region ca-central-1
```

---

## 13. Cost Estimate

Approximate monthly costs for a minimal production setup in `ca-central-1`:

| Service | Configuration | Estimated Monthly Cost |
|---------|--------------|----------------------|
| **ECS Fargate** | 1 task, 0.5 vCPU, 1 GB RAM | ~$15-20 |
| **RDS PostgreSQL** | db.t3.micro (free tier eligible for 12 months) | $0 — $15 |
| **ALB** | 1 load balancer + minimal traffic | ~$18-22 |
| **ECR** | <1 GB storage | ~$0.10 |
| **Secrets Manager** | 7 secrets | ~$3 |
| **CloudWatch Logs** | Minimal | ~$1-3 |
| **ACM Certificate** | Free | $0 |
| **Data Transfer** | Minimal | ~$1-5 |
| **Total** | | **~$38-68/month** |

Scale up to `db.t3.small` ($25/mo) and 2 Fargate tasks ($30-40/mo) for a real pilot.

---

## 14. Architecture Diagram

```
                    Internet
                       │
                       ▼
              ┌────────────────┐
              │   Route 53     │  DNS: litera.yourdomain.com
              │   (optional)   │
              └───────┬────────┘
                      │
                      ▼
              ┌────────────────┐
              │  ACM TLS Cert  │  Auto-renewing HTTPS
              └───────┬────────┘
                      │
                      ▼
              ┌────────────────┐
              │    ALB         │  Port 443 (HTTPS) → Target Group
              │  (public)      │  Port 80  → 301 redirect to HTTPS
              └───────┬────────┘
                      │ Port 5000
                      ▼
              ┌────────────────┐
              │  ECS Fargate   │  litera-app container
              │  (litera-      │  Image from ECR
              │   cluster)     │  Secrets from Secrets Manager
              └──┬──────┬──┬──┘
                 │      │  │
        ┌────────┘      │  └────────┐
        ▼               ▼           ▼
┌──────────────┐ ┌───────────┐ ┌──────────┐
│ RDS Postgres │ │  OpenAI   │ │  Resend  │
│ (private,    │ │  GPT-4o   │ │  (Email) │
│  encrypted)  │ │  (US API) │ │          │
└──────────────┘ └───────────┘ └──────────┘

        ca-central-1 (Canada)
```

---

## Execution Order Summary

Follow these steps in order, checking off as you go:

- [ ] **Step 1**: Install AWS CLI, Docker, Node.js on your machine
- [ ] **Step 2**: Set up IAM user, configure `aws configure`, create ECS execution role
- [ ] **Step 3**: Build Docker image, push to ECR
- [ ] **Step 4**: Create RDS PostgreSQL instance
- [ ] **Step 5**: Store secrets in Secrets Manager
- [ ] **Step 6**: Note VPC/subnet IDs, create security groups (ALB, ECS, update RDS)
- [ ] **Step 7.1-7.3**: Create ECS cluster, log group, register task definition
- [ ] **Step 8.1**: Request ACM TLS certificate, validate via DNS
- [ ] **Step 8.2-8.5**: Create ALB, target group, HTTPS + HTTP listeners
- [ ] **Step 7.4**: Create ECS service (needs target group ARN from step 8.3)
- [ ] **Step 9**: Point your domain DNS to the ALB
- [ ] **Step 10**: Push database schema, optionally migrate data
- [ ] **Step 11**: Verify everything works end-to-end
- [ ] **Step 12**: Set up deployment workflow, logging, scaling as needed
