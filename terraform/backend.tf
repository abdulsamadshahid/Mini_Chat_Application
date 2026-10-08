terraform {
  backend "s3" {
    bucket = "minichat-terraform-state-058835008914"
    key    = "minichat/terraform.tfstate"
    region = "ap-south-1"
  }
}