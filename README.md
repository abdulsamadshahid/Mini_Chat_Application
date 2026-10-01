# MiniChat — Kubernetes Deployment

MiniChat is a small real-time chat application deployed on a Kubernetes cluster running on AWS EC2.

The main focus of this project was the **DevOps and infrastructure side** of the application rather than application development.

The project covers AWS infrastructure provisioning with Terraform followed by EC2 configuration with Ansible and Kubernetes deployment with Kind. GitHub Actions is used to build Docker images and push them to Amazon ECR before deploying the application to the Kubernetes cluster.

## Architecture

```text
                         Internet
                            │
                            ▼
                    ┌───────────────┐
                    │   AWS EC2     │
                    │               │
                    │   Kind        │
                    │   Kubernetes  │
                    └───────┬───────┘
                            │
                       NodePort
                            │
                            ▼
                    ┌───────────────┐
                    │   Frontend    │
                    │ React + Nginx │
                    └───────┬───────┘
                            │
                     Kubernetes
                       Service
                            │
                            ▼
                    ┌───────────────┐
                    │    Backend    │
                    │ Node + Express│
                    └───────┬───────┘
                            │
                  ┌─────────┴─────────┐
                  ▼                   ▼
          ┌───────────────┐   ┌───────────────┐
          │  PostgreSQL   │   │     Redis     │
          │   Database    │   │  Pub/Sub      │
          └───────────────┘   └───────────────┘
```

## Technology Stack

### AWS

* EC2
* VPC
* Public Subnet
* Internet Gateway
* Route Table
* Security Groups
* IAM
* Amazon ECR

### Infrastructure & DevOps

* Terraform
* Ansible
* Docker
* Kubernetes
* Kind
* GitHub Actions
* AWS OIDC

### Application

* React
* Vite
* Node.js
* Express
* PostgreSQL
* Redis
* Socket.IO / WebSockets
* Nginx

## AWS Infrastructure

Terraform provisions the main AWS infrastructure:

* VPC
* Public subnet
* Internet Gateway
* Route table
* Security group
* EC2 instance
* IAM role and instance profile
* Amazon ECR repositories

The EC2 instance runs the Kind Kubernetes cluster.

```text
AWS
│
├── VPC
│   └── Public Subnet
│       └── EC2
│           └── Kind Cluster
│               ├── Control Plane
│               └── Workers
│
└── ECR
    ├── minichat-frontend
    └── minichat-backend
```

## Kubernetes Architecture

The application is separated into multiple Kubernetes workloads.

### Frontend

* React application
* Served through Nginx
* Exposed using a NodePort Service

### Backend

* Node.js + Express
* Handles API requests
* Handles WebSocket connections
* Communicates with PostgreSQL and Redis

### PostgreSQL

* Stores application data
* Uses a Kubernetes PersistentVolumeClaim for persistent storage

### Redis

* Used for Redis Pub/Sub
* Supports real-time communication between backend components

### Services

```text
frontend-service  → Frontend Pod
backend-service   → Backend Pod
postgres-service  → PostgreSQL Pod
redis-service     → Redis Pod
```

The frontend and backend communicate through Kubernetes Service DNS rather than hardcoded pod IP addresses.

For example:

```text
redis-service:6379
postgres-service:5432
backend-service:3000
```

## Infrastructure Deployment

### 1. Provision AWS Infrastructure

Terraform is used to create the AWS resources.

```bash
terraform init
terraform plan
terraform apply
```

### 2. Configure EC2

Ansible installs and configures the required tools on the EC2 instance.

The playbook installs:

* Docker
* Docker Compose
* AWS CLI
* Kind
* kubectl

The Kind cluster configuration is then copied to the EC2 instance.

### 3. Create Kind Cluster

The cluster uses one control-plane node and multiple worker nodes.

```bash
kind create cluster \
  --config kind-config.yaml \
  --name tws-kind-cluster
```

Verify the cluster:

```bash
kind get clusters
kubectl get nodes
```

## CI/CD

GitHub Actions handles the application deployment workflow.

```text
Git Push
   │
   ▼
GitHub Actions
   │
   ├── Authenticate with AWS using OIDC
   │
   ├── Build frontend image
   │
   ├── Build backend image
   │
   ├── Push images to Amazon ECR
   │
   └── SSH into EC2
           │
           ├── Copy Kubernetes manifests
           ├── Create Kind cluster if required
           ├── Authenticate Docker with ECR
           └── Apply Kubernetes manifests
```

AWS OIDC is used so GitHub Actions can assume an IAM role without storing long-lived AWS access keys in GitHub.

## Secrets

Application secrets are not committed to the repository.

Sensitive values such as:

* PostgreSQL password
* Database URL
* JWT secret

are stored as GitHub Actions Secrets.

The deployment workflow generates a Kubernetes Secret during deployment and applies it to the cluster.

```text
GitHub Secrets
      │
      ▼
GitHub Actions
      │
      ▼
Kubernetes Secret
      │
      ▼
Backend / PostgreSQL
```

## Troubleshooting

One of the most useful parts of the project was troubleshooting issues after the Kubernetes pods were already running.

### Frontend was not reachable

The frontend was working inside the cluster but could not initially be accessed through the EC2 public IP.

I had to trace the request through:

```text
EC2
→ Docker / Kind
→ NodePort
→ Kubernetes Service
→ Frontend Pod
```

This helped me understand the difference between the Kubernetes NodePort and the port exposed by the Kind container on the EC2 host.

### Backend Service had no endpoints

The frontend initially returned HTTP 502 when trying to communicate with the backend.

Checking the Service showed:

```bash
kubectl get endpoints backend-service
```

The Service had no endpoints.

The problem was that the Service selector did not match the labels on the backend Deployment.

After correcting the labels Kubernetes was able to associate the Service with the backend pods.

```text
Backend Deployment
        │
        │ labels
        ▼
Backend Pod

Backend Service
        │
        │ selector
        ▼
Backend Pod
```

This was a useful reminder that:

> A pod being `Running` does not necessarily mean the application is reachable.

## Useful Kubernetes Commands

Check all resources:

```bash
kubectl get all
```

Check pods:

```bash
kubectl get pods -o wide
```

Check services:

```bash
kubectl get svc
```

Check Service endpoints:

```bash
kubectl get endpoints
```

Check deployment status:

```bash
kubectl get deployments
```

Check logs:

```bash
kubectl logs deployment/backend-deployment
```

Describe a resource:

```bash
kubectl describe svc backend-service
```

Check the current cluster:

```bash
kubectl config current-context
```

## Project Structure

```text
.
├── ansible/
│   ├── inventory.ini
│   └── playbook.yml
│
├── terraform/
│   ├── main.tf
│   ├── provider.tf
│   └── variables.tf
│
├── frontend/
│   └── Dockerfile
│
├── backend/
│   └── Dockerfile
│
├── k8s/
│   ├── kind-config.yaml
│   ├── frontend-deployment.yml
│   ├── frontend-service.yml
│   ├── backend-deployment.yml
│   ├── backend-service.yml
│   ├── postgres-deployment.yml
│   ├── postgres-service.yml
│   ├── redis-deployment.yml
│   ├── redis-service.yml
│   └── postgres-pvc.yml
│
└── .github/
    └── workflows/
        └── deploy.yml
```

## What I Learned

The main takeaway from this project was learning to troubleshoot the application across multiple layers instead of looking only at Kubernetes.

A problem that appears as a frontend error can actually originate from:

* AWS networking
* Docker
* Kind port mappings
* Kubernetes Services
* Service selectors
* Pod labels
* Container ports
* Backend dependencies

This project gave me more practical experience with:

* Kubernetes networking
* Kubernetes Service discovery
* Docker containerization
* Terraform
* Ansible
* AWS infrastructure
* GitHub Actions
* AWS OIDC
* Kubernetes Secrets
* PostgreSQL
* Redis
* CI/CD

## Future Improvements

Possible improvements for a future version include:

* Move the deployment from Kind to Amazon EKS
* Add Kubernetes Ingress
* Add TLS
* Add resource requests and limits
* Add Horizontal Pod Autoscaling
* Add Prometheus and Grafana monitoring
* Improve the CI/CD workflow with image versioning instead of relying on mutable tags
* Add automated health checks and deployment verification

## Disclaimer

MiniChat was developed as the application component of this project. My primary focus was the infrastructure deployment and DevOps side including AWS provisioning containerization Kubernetes configuration automation and CI/CD.
