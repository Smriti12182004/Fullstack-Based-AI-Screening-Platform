# Fullstack Based AI-Powered Screening Platform

A full-stack AI-powered platform designed to support role-specific candidate screening and assessment during recruitment. The system uses job requirements to help create structured assessments, manage a reusable question bank, evaluate candidate responses, and provide recruiters with skill-wise and overall results.

## Project Overview

Traditional screening processes can be time-consuming when different roles require different technical skills, difficulty levels, and assessment criteria. This platform aims to provide a centralized screening workflow where recruiters can create role-specific assessments based on job requirements.

The platform combines a full-stack web application with AI-assisted capabilities. AI can assist with identifying relevant skills and generating assessment questions, while human review is maintained before generated questions become part of the approved question bank.

## Objectives

- Create role-specific screening assessments based on job requirements.
- Identify relevant skills and assessment categories from job descriptions.
- Maintain a reusable question bank containing reviewed and approved questions.
- Use AI to assist with question generation and content evaluation.
- Conduct MCQ-based assessments with optional free-text questions.
- Calculate overall and skill-wise candidate performance.
- Provide recruiters with structured results for screening and decision support.
- Maintain assessment and question-bank history for future use.

## Main Workflow

The planned workflow is:

1. Job Description
2. Skill / Category Identification
3. Skill Review
4. Question Retrieval / Generation
5. Validation and Human Review
6. Assessment Configuration
7. Candidate Assessment
8. Evaluation and Results

## Technology Stack

### Frontend
- React.js
- Tailwind CSS

### Backend
- FastAPI
- Python

### Database
- PostgreSQL

### AI / GenAI
- LLM-based services
- AI-assisted skill extraction
- AI-assisted question generation
- Optional AI-assisted free-text evaluation

### Retrieval
- Embeddings
- FAISS for semantic question retrieval

### Cloud / Deployment
- Supabase Storage
- Vercel
- Render

## Main Functional Modules

### Authentication and Role-Based Access
The system will support different user roles such as:
- Recruiter / HR
- Candidate
- Administrator

### Job and Requirement Management
Recruiters will be able to create or upload job descriptions that act as the starting point for assessment creation.

### Skill and Category Management
Relevant skills and categories will be identified from job requirements and reviewed before they are used for assessment configuration.

### Question Bank
The platform will maintain approved questions with attributes such as:
- Skill / Category
- Difficulty
- Question text
- Options
- Answer key
- Explanation / Rubric
- Approval status
- Source

### Assessment Management
Recruiters will be able to configure:
- Number of questions
- Category distribution
- Difficulty mix
- Assessment duration
- Candidate instructions

### Candidate Assessment
Candidates will complete the configured assessment through the web interface.

### Evaluation and Results
MCQ responses will be evaluated using the approved answer key. Where applicable, free-text responses can be evaluated using defined rubrics with AI assistance.

The system will provide:
- Question-level scores
- Skill-wise performance
- Difficulty-wise analysis
- Overall assessment score
- Recruiter-facing results

## AI-Assisted Workflow

AI is intended to assist rather than completely replace the review process.

The planned question workflow is:

`Generate → Validate → Human Review → Approve → Store in Question Bank`

Only approved questions are intended to be used in live assessments.

## Project Architecture

The application is planned as a full-stack system consisting of:

`Frontend → Backend API → Database / AI Services / Storage`

The backend will coordinate authentication, APIs, assessment logic, question-bank workflows, and evaluation-related processing.

## Project Structure

The repository will be organized to separate application components such as:

```text
frontend/
backend/
docs/
