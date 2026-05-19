#!/bin/bash
# Deploy AI worker to AWS EC2 GPU instance (g4dn.xlarge = T4 GPU, ~$0.53/hr)
# Run this once to set up. Worker auto-starts on reboot.
#
# Prerequisites:
#   1. AWS CLI configured (aws configure)
#   2. Security group allowing inbound on port 22
#   3. Redis running (either same instance or ElastiCache)
#
# Usage:  ./deploy-worker-aws.sh [region]

set -e
REGION=${1:-us-east-1}
INSTANCE_TYPE="g4dn.xlarge"    # T4 GPU — 45s per render
# INSTANCE_TYPE="g5.xlarge"    # A10G GPU — 20s per render (more expensive)

echo "[1] Finding latest Deep Learning AMI (CUDA 12)..."
AMI_ID=$(aws ec2 describe-images \
  --region "$REGION" \
  --owners amazon \
  --filters "Name=name,Values=Deep Learning OSS Nvidia Driver AMI GPU PyTorch*Ubuntu 22.04*" \
  --query 'sort_by(Images,&CreationDate)[-1].ImageId' \
  --output text)
echo "    AMI: $AMI_ID"

echo "[2] Launching $INSTANCE_TYPE instance..."
INSTANCE_ID=$(aws ec2 run-instances \
  --region "$REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name cuvr-key \
  --security-groups default \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=cuvr-ai-worker}]" \
  --user-data file://worker-userdata.sh \
  --query 'Instances[0].InstanceId' \
  --output text)
echo "    Instance: $INSTANCE_ID"

echo "[3] Waiting for instance to start..."
aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"
PUBLIC_IP=$(aws ec2 describe-instances \
  --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

echo ""
echo "✓ Worker instance running at $PUBLIC_IP"
echo ""
echo "Next steps:"
echo "  1. Copy your .env to the instance:"
echo "     scp .env ubuntu@$PUBLIC_IP:/home/ubuntu/cuvr/.env"
echo "  2. Copy backend code:"
echo "     rsync -avz --exclude '__pycache__' . ubuntu@$PUBLIC_IP:/home/ubuntu/cuvr/"
echo "  3. SSH in and start:"
echo "     ssh ubuntu@$PUBLIC_IP 'cd /home/ubuntu/cuvr && ./start-worker.sh'"
echo ""
echo "  Or build Docker:"
echo "     docker build -f Dockerfile.worker -t cuvr-worker ."
echo "     docker run --gpus all --env-file .env cuvr-worker"
