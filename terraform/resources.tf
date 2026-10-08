resource "aws_ecr_repository" "minichat_frontend" {
  name                 = "minichat_frontend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}
resource "aws_ecr_repository" "minichat_backend" {
  name                 = "minichat_backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = local.name
  cidr = "10.0.0.0/16"

  azs             = ["ap-south-1a", "ap-south-1b"]
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.11.0/24", "10.0.12.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true

}


module "eks_al2023" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"
  

  name               = "minichat-cluster"
  kubernetes_version = "1.36"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
  addons = {
    coredns = {}

    kube-proxy = {}

    vpc-cni = {}
  }
  eks_managed_node_groups = {
    minichat = {
      # Starting on 1.30, AL2023 is the default AMI type for EKS managed node groups
      instance_types = ["c7i-flex.large"]
      ami_type       = "AL2023_x86_64_STANDARD"

      min_size = 1
      max_size = 2
      desired_size = 1
    }
  }
}