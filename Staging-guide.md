# Staging Guide: Running Hyperlane Validator & Relayer on AWS EC2

This guide covers provisioning an EC2 instance and configuring AWS services to run Hyperlane **validator** and **relayer** agents for the **pruvtest ↔ Solana Testnet** bridge in a cloud staging environment.

> **Prerequisite**: You should have already completed the [TESTNET_GUIDE.md](TESTNET_GUIDE.md) — all contracts deployed, ISMs configured, routers enrolled, and bridge tested locally.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [AWS Services Setup](#2-aws-services-setup)
3. [EC2 Instance Provisioning](#3-ec2-instance-provisioning)
4. [Clone and Build the Repository](#4-clone-and-build-the-repository)
5. [Agent Configuration](#5-agent-configuration)
6. [Running the Validator](#6-running-the-validator)
7. [Running the Relayer](#7-running-the-relayer)
8. [Running as systemd Services](#8-running-as-systemd-services)
9. [Monitoring and Health Checks](#9-monitoring-and-health-checks)
10. [Security Hardening](#10-security-hardening)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  AWS Account (kms-bridge-dev, ap-southeast-2)                            │
│                                                                          │
│  ┌─────────────────┐    ┌──────────────────────────────────────────┐     │
│  │  S3 Bucket      │◄───│  EC2 Instance (Ubuntu 22.04)             │     │
│  │  (public read)  │ W  │                                          │     │
│  └────────┬────────┘    │  ┌──────────────┐  ┌──────────────────┐ │     │
│           │             │  │  Validator    │  │  Relayer          │ │     │
│  ┌────────┴────────┐    │  │  (port 9091) │  │  (port 9090)     │ │     │
│  │  KMS Key 1      │◄───│  │  KMS sign    │  │  KMS sign (EVM)  │ │     │
│  │  validator-     │ S  │  │  checkpoints │  │  Hex key (Solana)│ │     │
│  │  signer-staging │    │  └──────────────┘  └──────────────────┘ │     │
│  └─────────────────┘    └──────────────────────────────────────────┘     │
│                                                                          │
│  ┌─────────────────┐                                                     │
│  │  KMS Key 2      │  Relayer signs EVM txs (pruvtest delivery)          │
│  │  relayer-       │                                                     │
│  │  signer-staging │                                                     │
│  └─────────────────┘                                                     │
│                                                                          │
│  ┌─────────────────┐                                                     │
│  │  IAM User       │  AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY          │
│  │  (single user   │  used for S3 writes + KMS signing by both agents    │
│  │   for all)      │                                                     │
│  └─────────────────┘                                                     │
└──────────────────────────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
   pruvtest RPC               Solana Testnet RPC
   (EVM, domain 7336)         (domain 1399811150)
```

**Validator** watches the pruvtest Mailbox, signs checkpoint merkle roots using **KMS Key 1**, and writes them to S3.

**Relayer** reads checkpoints from S3 (anonymously), signs EVM delivery transactions using **KMS Key 2**, and signs Solana transactions using a **hex key** (KMS does not support Solana signing).

---

## 2. AWS Services Setup

### Summary of AWS Resources

| Resource  | Name (staging)                                      | Purpose                                         |
| --------- | --------------------------------------------------- | ----------------------------------------------- |
| IAM User  | `wade-solana-testnet-bridge`                        | Single service account for S3 + KMS             |
| S3 Bucket | `wade-solana-testnet-bridge`                        | Validator checkpoint storage (public read)      |
| KMS Key 1 | `alias/pruv-solana-bridge-validator-signer-staging` | Validator EVM signing (checkpoint attestations) |
| KMS Key 2 | `alias/pruv-solana-testnet-relayer-signer-staging`  | Relayer EVM signing (pruvtest delivery txs)     |

### 2.1 Create an IAM User (Service Account)

Create a **dedicated service account** — not your admin login user. Both agents share this single identity.

**AWS Console**: IAM → Users → Create user

| Setting        | Value                                               |
| -------------- | --------------------------------------------------- |
| User name      | `wade-solana-testnet-bridge`                        |
| Console access | **Do NOT enable** (service account only)            |
| Permissions    | Skip — granted via bucket policy and KMS key policy |

After creating the user:

1. Click the user → **Security credentials** tab
2. Click **Create access key** → Use case: **Other**
3. Save the `Access Key ID` and `Secret Access Key`

> Store securely — you only see the secret once. Use `chmod 600` on any file containing it.

### 2.2 Create an S3 Bucket

The bucket stores validator checkpoint signatures. It must be **publicly readable** so any relayer can fetch checkpoints anonymously.

**AWS Console**: S3 → Create bucket

| Setting            | Value                                               |
| ------------------ | --------------------------------------------------- |
| Bucket name        | `wade-solana-testnet-bridge`                        |
| Region             | `ap-southeast-2` (Sydney)                           |
| Object Ownership   | ACLs disabled                                       |
| Default encryption | SSE-S3 (Amazon S3 managed keys), Bucket Key enabled |
| Bucket Versioning  | Enabled                                             |
| Object Lock        | Disabled                                            |

**Block Public Access settings** (critical):

| Setting                           | Value         | Reason                                            |
| --------------------------------- | ------------- | ------------------------------------------------- |
| Block public access via new ACLs  | **Checked**   | ACLs not used                                     |
| Block public access via any ACLs  | **Checked**   | ACLs not used                                     |
| Block public bucket policies      | **Unchecked** | Must allow public bucket policy for relayer reads |
| Block public cross-account access | **Unchecked** | Must allow anonymous public reads                 |

> Do NOT use SSE-KMS encryption — the relayer's anonymous client cannot decrypt KMS-encrypted objects.

### 2.3 Apply the S3 Bucket Policy

Go to your S3 bucket → **Permissions** → **Bucket policy** (not CORS) and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadForRelayer",
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::wade-solana-testnet-bridge",
        "arn:aws:s3:::wade-solana-testnet-bridge/*"
      ]
    },
    {
      "Sid": "AgentWrite",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::267772924106:user/wade-solana-testnet-bridge"
      },
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::wade-solana-testnet-bridge",
        "arn:aws:s3:::wade-solana-testnet-bridge/*"
      ]
    }
  ]
}
```

### 2.4 Create KMS Keys

Create two asymmetric KMS keys — one for validator signing, one for relayer signing.

**AWS Console**: KMS → Customer managed keys → Create key

For each key use these settings:

| Setting   | Value                                                 |
| --------- | ----------------------------------------------------- |
| Key type  | **Asymmetric**                                        |
| Key usage | **Sign and verify**                                   |
| Key spec  | **ECC_SECG_P256K1** (secp256k1 — Ethereum compatible) |

|                       | Key 1 (Validator)                             | Key 2 (Relayer)                              |
| --------------------- | --------------------------------------------- | -------------------------------------------- |
| Alias                 | `pruv-solana-bridge-validator-signer-staging` | `pruv-solana-testnet-relayer-signer-staging` |
| Key administrators    | Your admin IAM user                           | Your admin IAM user                          |
| Key usage permissions | `wade-solana-testnet-bridge`                  | `wade-solana-testnet-bridge`                 |

After creating both keys, verify the key policy for each includes `kms:Sign` and `kms:GetPublicKey` for `wade-solana-testnet-bridge`. If the auto-generated policy only has `kms:CreateGrant` and `kms:DescribeKey`, edit it and add:

```json
"Action": [
  "kms:CreateGrant",
  "kms:DescribeKey",
  "kms:Sign",
  "kms:GetPublicKey"
]
```

### 2.5 Update Solana Multisig ISM with New Validator Address

The KMS validator key generates a **new EVM address**. The Solana ISM must be updated to recognize it.

**Get the validator's new EVM address** — start the validator briefly and look for:

```
INFO validator::validator: Attempting self announce, eth_validator_address: 0x<NEW_ADDRESS>
```

**Then update the ISM:**

```bash
cd rust/sealevel

MULTISIG_ISM=$(cat environments/testnet/solanatestnet/core/program-ids.json | \
  python3 -c "import json,sys; print(json.load(sys.stdin)['multisig_ism_message_id'])")

./target/debug/hyperlane-sealevel-client multisig-ism-message-id set-validators-and-threshold \
  --program-id $MULTISIG_ISM \
  --domain 7336 \
  --validators <NEW_VALIDATOR_EVM_ADDRESS> \
  --threshold 1 \
  --url https://api.testnet.solana.com \
  --keypair ~/.config/solana/pruv-bridge-deployer.json
```

---

## 3. EC2 Instance Provisioning

### 3.1 Instance Recommendation

| Setting        | Recommendation                                    | Notes                                                                             |
| -------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| AMI            | Ubuntu 22.04 LTS (x86_64)                         | Stable, well-supported for Rust builds                                            |
| Instance type  | `t3.medium` (2 vCPU, 4 GB RAM)                    | Minimum for building Rust agents. Use `t3.large` (8 GB) if builds are slow or OOM |
| Storage        | 50 GB gp3                                         | Rust build artifacts are large (~10 GB for debug builds)                          |
| Security Group | Inbound: SSH (22), optional 9090-9091 for metrics | Restrict SSH to your IP; metrics ports only if needed externally                  |
| Key pair       | Create or use existing SSH key                    | For SSH access                                                                    |
| Region         | Same region as S3 bucket                          | Lower latency for checkpoint writes                                               |

> For production, consider `t3.large` or `m6i.large` to handle both agents comfortably. The relayer can spike in memory when indexing many messages.

### 3.2 Security Group Rules

| Type         | Protocol | Port | Source                 | Purpose                                 |
| ------------ | -------- | ---- | ---------------------- | --------------------------------------- |
| SSH          | TCP      | 22   | Your IP (`x.x.x.x/32`) | Remote access                           |
| Custom TCP   | TCP      | 9090 | Your IP or VPC CIDR    | Relayer Prometheus metrics (optional)   |
| Custom TCP   | TCP      | 9091 | Your IP or VPC CIDR    | Validator Prometheus metrics (optional) |
| All outbound | All      | All  | 0.0.0.0/0              | RPC calls, S3 writes                    |

---

## 4. Clone and Build the Repository

### 4.1 SSH Into the Instance

```bash
ssh -i <your-key.pem> ubuntu@<ec2-public-ip>
```

### 4.2 Install System Dependencies

```bash
sudo apt update && sudo apt upgrade -y

sudo apt install -y \
  build-essential \
  pkg-config \
  libssl-dev \
  libclang-dev \
  cmake \
  git \
  curl \
  unzip \
  jq
```

### 4.3 Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

rustup install stable
rustup default stable
rustc --version
```

### 4.4 Install Node.js (for TypeScript CLI, if needed)

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g yarn
node --version
```

### 4.5 Install Solana CLI (for Solana warp route operations, if needed)

```bash
# Only needed if you plan to deploy/manage Solana warp routes from this machine
sh -c "$(curl -sSfL https://release.anza.xyz/v1.14.20/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
solana --version
```

### 4.6 Install AWS CLI (for verifying S3)

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
rm -rf aws awscliv2.zip
aws --version
```

### 4.7 Clone the Repository

```bash
cd ~
git clone <YOUR_REPO_URL> pruv-bridge-sc
cd pruv-bridge-sc
```

> Replace `<YOUR_REPO_URL>` with your actual Git remote URL. Make sure you have access (SSH key or personal access token configured).

### 4.8 Build Hyperlane Agents

```bash
cd ~/pruv-bridge-sc/rust/main
cargo build --bin validator --bin relayer
```

> First build takes 10-20 minutes on `t3.medium`. Subsequent builds are much faster. If the build is killed by OOM, use a `t3.large` instance or add swap space:
>
> ```bash
> sudo fallocate -l 4G /swapfile
> sudo chmod 600 /swapfile
> sudo mkswap /swapfile
> sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```

---

## 5. Agent Configuration

### 5.1 Copy the Agent Config

The agent config file is already in the repo at `rust/main/config/agent-config-testnet.json`. Verify it has the correct settings:

```bash
cat ~/pruv-bridge-sc/rust/main/config/agent-config-testnet.json | jq .
```

Key fields to verify:

| Field                              | Expected Value                                       |
| ---------------------------------- | ---------------------------------------------------- |
| `allowlocalcheckpointsyncers`      | `false`                                              |
| `gaspaymentenforcement`            | `[{"type":"none"}]`                                  |
| `defaultsigner.type`               | `"aws"`                                              |
| `defaultsigner.id`                 | `"alias/pruv-solana-testnet-relayer-signer-staging"` |
| `defaultsigner.region`             | `"ap-southeast-2"`                                   |
| `chains.solanatestnet.signer.type` | `"hexKey"` (KMS does not support Solana)             |

### 5.2 Create Environment Files

Store sensitive values in env files instead of embedding them in shell commands:

```bash
sudo mkdir -p /etc/hyperlane

# Validator env file (KMS signing + S3 checkpoints)
sudo tee /etc/hyperlane/validator.env > /dev/null << 'EOF'
AWS_ACCESS_KEY_ID=<YOUR_AWS_ACCESS_KEY_ID>
AWS_SECRET_ACCESS_KEY=<YOUR_AWS_SECRET_ACCESS_KEY>
HYP_ORIGINCHAINNAME=pruvtest
HYP_VALIDATOR_TYPE=aws
HYP_VALIDATOR_ID=alias/pruv-solana-bridge-validator-signer-staging
HYP_VALIDATOR_REGION=ap-southeast-2
HYP_CHECKPOINTSYNCER_TYPE=s3
HYP_CHECKPOINTSYNCER_BUCKET=wade-solana-testnet-bridge
HYP_CHECKPOINTSYNCER_REGION=ap-southeast-2
HYP_CHECKPOINTSYNCER_FOLDER=pruvtest
HYP_DB=/var/lib/hyperlane/validator-pruvtest
HYP_TRACING_LEVEL=info
HYP_METRICSPORT=9091
CONFIG_FILES=/home/ubuntu/pruv-bridge-sc/rust/main/config/agent-config-testnet.json
EOF
sudo chmod 600 /etc/hyperlane/validator.env

# Relayer env file (KMS signing for EVM, hex key for Solana via config file)
sudo tee /etc/hyperlane/relayer.env > /dev/null << 'EOF'
AWS_ACCESS_KEY_ID=<YOUR_AWS_ACCESS_KEY_ID>
AWS_SECRET_ACCESS_KEY=<YOUR_AWS_SECRET_ACCESS_KEY>
HYP_RELAYCHAINS=pruvtest,solanatestnet
HYP_DB=/var/lib/hyperlane/relayer
HYP_TRACING_LEVEL=info
HYP_METRICSPORT=9090
HYP_GASPAYMENTENFORCEMENT=[{"type":"none"}]
CONFIG_FILES=/home/ubuntu/pruv-bridge-sc/rust/main/config/agent-config-testnet.json
EOF
sudo chmod 600 /etc/hyperlane/relayer.env
```

> The relayer's KMS signer (`defaultsigner`) and Solana hex key (`chains.solanatestnet.signer`) are both configured in `agent-config-testnet.json`. No `HYP_DEFAULTSIGNER_*` env vars needed — the config file handles it.

### 5.3 Create Data Directories

```bash
sudo mkdir -p /var/lib/hyperlane/validator-pruvtest
sudo mkdir -p /var/lib/hyperlane/relayer
sudo chown -R ubuntu:ubuntu /var/lib/hyperlane
```

---

## 6. Running the Validator

### Manual Start (for testing)

```bash
cd ~/pruv-bridge-sc/rust/main

set -a; source /etc/hyperlane/validator.env; set +a

./target/debug/validator
```

Watch the logs for:

```
INFO validator::validator: Validator has announced signature storage location
```

This confirms the validator announced `s3://<bucket>/<region>/pruvtest` on-chain and is writing checkpoints to S3.

### Verify Checkpoints in S3

```bash
aws configure  # enter your access key and secret, region, output=json

aws s3 ls s3://<YOUR_BUCKET_NAME>/pruvtest/
```

You should see files like:

```
checkpoint_latest_index.json
checkpoint_0_with_id.json
checkpoint_1_with_id.json
...
announcement.json
```

---

## 7. Running the Relayer

### Manual Start (for testing)

```bash
cd ~/pruv-bridge-sc/rust/main

set -a; source /etc/hyperlane/relayer.env; set +a

./target/debug/relayer
```

The relayer:

1. Fetches announced storage locations from `ValidatorAnnounce` on pruvtest
2. Finds the `s3://...` announcement
3. Reads checkpoints from S3 anonymously (no AWS credentials needed)
4. Delivers messages to destination chains

---

## 8. Running as systemd Services

For a persistent staging environment, use systemd to keep agents running across reboots.

### 8.1 Validator Service

```bash
sudo tee /etc/systemd/system/hyperlane-validator.service > /dev/null << 'EOF'
[Unit]
Description=Hyperlane Validator (pruvtest)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/pruv-bridge-sc/rust/main
EnvironmentFile=/etc/hyperlane/validator.env
ExecStart=/home/ubuntu/pruv-bridge-sc/rust/main/target/debug/validator
Restart=always
RestartSec=10
LimitNOFILE=65535

StandardOutput=journal
StandardError=journal
SyslogIdentifier=hyperlane-validator

[Install]
WantedBy=multi-user.target
EOF
```

### 8.2 Relayer Service

```bash
sudo tee /etc/systemd/system/hyperlane-relayer.service > /dev/null << 'EOF'
[Unit]
Description=Hyperlane Relayer (pruvtest <-> solanatestnet)
After=network-online.target hyperlane-validator.service
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/pruv-bridge-sc/rust/main
EnvironmentFile=/etc/hyperlane/relayer.env
ExecStart=/home/ubuntu/pruv-bridge-sc/rust/main/target/debug/relayer
Restart=always
RestartSec=10
LimitNOFILE=65535

StandardOutput=journal
StandardError=journal
SyslogIdentifier=hyperlane-relayer

[Install]
WantedBy=multi-user.target
EOF
```

### 8.3 Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable hyperlane-validator hyperlane-relayer

# Start validator first, wait for announcement, then start relayer
sudo systemctl start hyperlane-validator
sudo journalctl -u hyperlane-validator -f
# Wait until you see "Validator has announced signature storage location"
# Then Ctrl+C and start the relayer:

sudo systemctl start hyperlane-relayer
```

### 8.4 Common Service Commands

```bash
# View logs (live)
sudo journalctl -u hyperlane-validator -f
sudo journalctl -u hyperlane-relayer -f

# View last 100 lines
sudo journalctl -u hyperlane-validator -n 100
sudo journalctl -u hyperlane-relayer -n 100

# Restart
sudo systemctl restart hyperlane-validator
sudo systemctl restart hyperlane-relayer

# Stop
sudo systemctl stop hyperlane-relayer
sudo systemctl stop hyperlane-validator

# Status
sudo systemctl status hyperlane-validator
sudo systemctl status hyperlane-relayer
```

---

## 9. Monitoring and Health Checks

### 9.1 Prometheus Metrics

Both agents expose Prometheus-compatible metrics:

```bash
# Validator metrics
curl -s http://localhost:9091/metrics | grep hyperlane_latest_checkpoint

# Relayer metrics
curl -s http://localhost:9090/metrics | grep hyperlane_messages_processed
```

### 9.2 S3 Checkpoint Health

```bash
# Check the latest checkpoint index
aws s3 cp s3://<BUCKET_NAME>/pruvtest/checkpoint_latest_index.json - | jq .

# Count total checkpoint files
aws s3 ls s3://<BUCKET_NAME>/pruvtest/ | wc -l
```

### 9.3 Simple Health Check Script

```bash
#!/bin/bash
# save as /home/ubuntu/health-check.sh

echo "=== Validator ==="
systemctl is-active hyperlane-validator
curl -sf http://localhost:9091/metrics | grep -c "hyperlane" || echo "Metrics unavailable"

echo ""
echo "=== Relayer ==="
systemctl is-active hyperlane-relayer
curl -sf http://localhost:9090/metrics | grep -c "hyperlane" || echo "Metrics unavailable"

echo ""
echo "=== S3 Checkpoints ==="
aws s3 cp s3://<BUCKET_NAME>/pruvtest/checkpoint_latest_index.json - 2>/dev/null | jq . || echo "Cannot read S3"

echo ""
echo "=== Disk Usage ==="
df -h /var/lib/hyperlane
du -sh /var/lib/hyperlane/*
```

---

## 10. Security Hardening

### 10.1 Protect Private Keys

- Never commit private keys to Git
- Use `chmod 600` on env files: `sudo chmod 600 /etc/hyperlane/*.env`
- Consider using AWS Secrets Manager or AWS Systems Manager Parameter Store for production
- Restrict `/etc/hyperlane/` directory: `sudo chmod 700 /etc/hyperlane`

### 10.2 Restrict SSH Access

- Use SSH key-based authentication only (disable password auth)
- Restrict Security Group inbound SSH to specific IPs
- Consider using AWS Session Manager instead of SSH

### 10.3 IAM Least Privilege

The validator IAM user should only have access to its specific S3 bucket. The bucket policy in Section 2.3 already handles this — do not attach additional broad S3 policies to the user.

### 10.4 Rotate AWS Access Keys

Periodically rotate the validator's AWS access keys:

```bash
# 1. Create a new access key in IAM console
# 2. Update /etc/hyperlane/validator.env with the new key
# 3. Restart the validator
sudo systemctl restart hyperlane-validator
# 4. Verify it's working (check S3 writes)
# 5. Delete the old access key from IAM console
```

### 10.5 Enable Automatic Security Updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## 11. Troubleshooting

### Validator not writing to S3

```bash
# Check validator logs for S3 errors
sudo journalctl -u hyperlane-validator -n 50 | grep -i "s3\|error\|bucket"
```

| Symptom                     | Cause                           | Fix                                                                                 |
| --------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| `AccessDenied` on PutObject | IAM user lacks write permission | Verify bucket policy has the correct IAM user ARN                                   |
| `NoSuchBucket`              | Bucket name or region mismatch  | Check `HYP_CHECKPOINTSYNCER_BUCKET` and `HYP_CHECKPOINTSYNCER_REGION` match exactly |
| `InvalidAccessKeyId`        | Wrong AWS credentials           | Verify `AWS_ACCESS_KEY_ID` in validator.env                                         |
| `SignatureDoesNotMatch`     | Wrong AWS secret key            | Regenerate access key and update validator.env                                      |

### Relayer cannot fetch checkpoints from S3

```bash
sudo journalctl -u hyperlane-relayer -n 50 | grep -i "CouldNotFetchMetadata\|s3\|checkpoint"
```

| Symptom                            | Cause                                     | Fix                                                                           |
| ---------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `CouldNotFetchMetadata`            | Bucket not publicly readable              | Verify Block Public Access settings and bucket policy                         |
| `Ignoring disallowed LocalStorage` | Old `file://` announcements being skipped | Expected behavior — the relayer will use the S3 announcement instead          |
| No S3 attempts in logs             | Validator hasn't announced S3 yet         | Check validator logs for "Validator has announced signature storage location" |

### Build failures on EC2

| Symptom                       | Cause               | Fix                                               |
| ----------------------------- | ------------------- | ------------------------------------------------- |
| `Killed` during `cargo build` | Out of memory       | Use `t3.large` or add 4 GB swap (see Section 4.8) |
| `linker cc not found`         | Missing build tools | Run `sudo apt install build-essential`            |
| OpenSSL errors                | Missing libssl-dev  | Run `sudo apt install libssl-dev pkg-config`      |

### Agent restarts or crashes

```bash
# Check exit status
sudo systemctl status hyperlane-validator
sudo systemctl status hyperlane-relayer

# Check for OOM kills
sudo dmesg | grep -i "killed process"

# Check disk space
df -h
```

### Checking on-chain validator announcements

From a machine with `cast` installed:

```bash
cast call 0x3B25B046bf50E3D469bbF2610bf564f11a4dC8c2 \
  "getAnnouncedStorageLocations(address[])" \
  "[<VALIDATOR_EVM_ADDRESS>]" \
  --rpc-url https://rpc.testnet.pruv.network
```

The returned data should include the S3 storage location string.

---

## Quick Reference: Full Command Summary

### Signer Architecture

| Chain          | Agent     | Signer                                                                                 |
| -------------- | --------- | -------------------------------------------------------------------------------------- |
| pruvtest (EVM) | Validator | KMS `alias/pruv-solana-bridge-validator-signer-staging`                                |
| pruvtest (EVM) | Relayer   | KMS `alias/pruv-solana-testnet-relayer-signer-staging` (via `defaultsigner` in config) |
| solanatestnet  | Relayer   | Hex key `0x44928c...` (via `chains.solanatestnet.signer` in config)                    |

### Validator (KMS signing + S3 checkpoints)

```bash
AWS_ACCESS_KEY_ID="<AWS_ACCESS_KEY_ID>" \
AWS_SECRET_ACCESS_KEY="<AWS_SECRET_ACCESS_KEY>" \
HYP_ORIGINCHAINNAME="pruvtest" \
HYP_VALIDATOR_TYPE="aws" \
HYP_VALIDATOR_ID="alias/pruv-solana-bridge-validator-signer-staging" \
HYP_VALIDATOR_REGION="ap-southeast-2" \
HYP_CHECKPOINTSYNCER_TYPE="s3" \
HYP_CHECKPOINTSYNCER_BUCKET="wade-solana-testnet-bridge" \
HYP_CHECKPOINTSYNCER_REGION="ap-southeast-2" \
HYP_CHECKPOINTSYNCER_FOLDER="pruvtest" \
HYP_DB="/var/lib/hyperlane/validator-pruvtest" \
HYP_TRACING_LEVEL="info" \
HYP_METRICSPORT="9091" \
CONFIG_FILES="/home/ubuntu/pruv-bridge-sc/rust/main/config/agent-config-testnet.json" \
./target/debug/validator
```

### Relayer (KMS signing for EVM, hex key for Solana)

```bash
AWS_ACCESS_KEY_ID="<AWS_ACCESS_KEY_ID>" \
AWS_SECRET_ACCESS_KEY="<AWS_SECRET_ACCESS_KEY>" \
HYP_RELAYCHAINS="pruvtest,solanatestnet" \
HYP_DB="/var/lib/hyperlane/relayer" \
HYP_TRACING_LEVEL="info" \
HYP_METRICSPORT="9090" \
HYP_GASPAYMENTENFORCEMENT='[{"type":"none"}]' \
CONFIG_FILES="/home/ubuntu/pruv-bridge-sc/rust/main/config/agent-config-testnet.json" \
./target/debug/relayer
```

> The relayer's KMS signer for pruvtest and hex key for solanatestnet are both configured in `agent-config-testnet.json` (`defaultsigner` and `chains.solanatestnet.signer`). No `HYP_DEFAULTSIGNER_*` env vars needed.
