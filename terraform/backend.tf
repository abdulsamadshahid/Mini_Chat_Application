terraform {
  backend "s3" {
    bucket = "minichat-terraform-state"
    key    = "minichat/terraform.tfstate"
    region = "ap-south-1"
  }
}