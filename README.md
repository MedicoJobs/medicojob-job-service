# medicojob-job-service

This repository contains the job-service microservice.

## CI

The CI pipeline runs SonarQube first, then Snyk.

## Docker

After a merged PR has the uild label, the Docker pipeline builds, scans, and pushes to GHCR.