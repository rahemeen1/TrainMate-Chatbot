# TrainMate Backend Cloud Run Deployment Guide

## 1) Prerequisites

- Install Google Cloud SDK.
- Verify installation:
  - gcloud --version
- Authenticate:
  - gcloud auth login
- Set active project:
  - gcloud config set project trainmate-chatbot
- Optional but recommended: set default region:
  - gcloud config set run/region us-central1
- Enable required services:
  - gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
- Verify services are enabled:
  - gcloud services list --enabled --filter="name:run.googleapis.com OR name:cloudbuild.googleapis.com OR name:artifactregistry.googleapis.com"
- Recommended for local Firebase Admin checks:
  - gcloud auth application-default login

## 2) Backend code readiness

This repository is now configured so Firebase Admin can run in both environments:

- Cloud Run: uses Application Default Credentials automatically.
- Local development: uses serviceAccountKey.json when present.

Health endpoint for smoke test:

- GET /healthz

## 3) Deploy backend to Cloud Run

From trainmate-backend folder:

- gcloud run deploy trainmate-backend --source . --region us-central1 --allow-unauthenticated --port 8080

## 4) Configure runtime environment variables

Set required environment variables after first deploy:

- gcloud run services update trainmate-backend --region us-central1 --set-env-vars GEMINI_API_KEY=YOUR_VALUE,PINECONE_API_KEY=YOUR_VALUE,PINECONE_INDEX=YOUR_VALUE,COHERE_API_KEY=YOUR_VALUE,OPENAI_API_KEY=YOUR_VALUE,GOOGLE_CLIENT_ID=YOUR_VALUE,GOOGLE_CLIENT_SECRET=YOUR_VALUE,GOOGLE_REDIRECT_URI=https://trainmate-chatbot.web.app/auth/google/callback,COMPANY_GOOGLE_REDIRECT_URI=https://trainmate-chatbot.web.app/auth/company-google-callback,FRONTEND_URL=https://trainmate-chatbot.web.app,EMAIL_USER=YOUR_VALUE,EMAIL_PASS=YOUR_VALUE

If you have many values, use a file for easier management:

1. Create env.yaml in trainmate-backend:

   GEMINI_API_KEY: "YOUR_VALUE"
   PINECONE_API_KEY: "YOUR_VALUE"
   PINECONE_INDEX: "YOUR_VALUE"
   COHERE_API_KEY: "YOUR_VALUE"
   OPENAI_API_KEY: "YOUR_VALUE"
   GOOGLE_CLIENT_ID: "YOUR_VALUE"
   GOOGLE_CLIENT_SECRET: "YOUR_VALUE"
  GOOGLE_REDIRECT_URI: "https://trainmate-chatbot.web.app/auth/google/callback"
  COMPANY_GOOGLE_REDIRECT_URI: "https://trainmate-chatbot.web.app/auth/company-google-callback"
  FRONTEND_URL: "https://trainmate-chatbot.web.app"
   EMAIL_USER: "YOUR_VALUE"
   EMAIL_PASS: "YOUR_VALUE"

2. Apply:

   gcloud run services update trainmate-backend --region us-central1 --env-vars-file env.yaml

## 5) Verify deployed service

Your deployed URL (live now):

- https://trainmate-backend-161059187631.us-central1.run.app

Test root endpoint:                 x

- curl https://trainmate-backend-161059187631.us-central1.run.app/

Health check:

- curl https://trainmate-backend-161059187631.us-central1.run.app/healthz

## 6) Connect frontend

Set this in your frontend deployment environment:

- REACT_APP_API_BASE_URL=https://trainmate-backend-161059187631.us-central1.run.app

Optional if you want to pin the OAuth callback explicitly instead of relying on `window.location.origin`:

- REACT_APP_GOOGLE_REDIRECT_URI=https://trainmate-chatbot.web.app/auth/google/callback

Then redeploy frontend hosting.

## Notes

- On Cloud Run, Firebase Admin uses the Cloud Run service account (ADC).
- For local development, serviceAccountKey.json fallback is still supported.
- Keep serviceAccountKey.json out of source control.
