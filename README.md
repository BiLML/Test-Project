# Project-Group-4
● English: System for Retinal Vascular Health Screening 

● Vietnamese: Hệ Thống Sàng Lọc Sức Khỏe Mạch Máu Võng Mạc

● Abbreviation: SP26SE025

a. Context:
1. In the era of preventative medicine and personalized healthcare, the early detection of systemic health risks has become an essential requirement for enhancing quality of life and reducing the burden of healthcare costs. However, many serious diseases, particularly those related to cardiovascular, diabetic, and neurological conditions, often progress silently and are only discovered in their late stages.
2. Many individuals in Vietnam face barriers in accessing comprehensive, non-invasive, and regular screening methods due to high costs, complex procedures, or a lack of specialized personnel at the grassroots level. The absence of a fast, accurate, and widely deployable screening tool presents a significant challenge.

b. Proposed Solutions

-The Comprehensive AI Understanding Retinal Analysis (AURA) offers an integrated approach to enhance early detection and prevention of diseases through retinal imaging analysis.

+Clinical Decision Support, Not Replacement: AURA acts as a Clinical Decision Support (CDS) tool that assists — not replaces — physicians. The AI system analyzes retinal vasculature to detect subtle vascular abnormalities and provide early diseases risk assessments, enabling doctors to make faster and more confident decisions.

+Expanding Access to Preventive Care: By connecting to existing fundus cameras and offering cloud-based analysis, AURA makes advanced vascular screening available even to community clinics and mid-tier hospitals. This reduces the need for costly diagnostic infrastructure and helps bring preventive healthcare to underserved regions.

+Retinal Imaging as a Non-Invasive Health Indicator: The system leverages the eye as a “window” to systemic health, using retinal vessel morphology to estimate risks of hypertension, diabetes complications, and stroke — transforming routine eye exams into a broader tool for disease risk screening.

+Data Collaboration and Continuous Learning: AURA encourages data partnerships between clinics, hospitals, and research institutions. It begins with open datasets for model training and evolves through real-world feedback, strengthening both the AI model and the clinical understanding of vascular health.

+Ethical, Transparent, and Secure AI Use: All outputs are interpretable and visually explainable, allowing doctors to validate AI findings. Strict data privacy, patient anonymization, and compliance with medical regulations ensure safe and responsible AI adoption.

-In essence, AURA delivers a scalable, ethical, and data-driven solution that empowers healthcare providers to detect cardiovascular risks early, reduce diagnostic barriers, and improve patient outcomes through AI-assisted retinal screening.

● Functional requirement

1. User Functional Requirements:

[FR-1] Register and log in using email, Google account, or social authentication.

[FR-2] Upload single or multiple retinal (Fundus or OCT) images for analysis.

[FR-3] View AI-generated diagnostic results and risk levels.

[FR-4] Visualize annotated images showing affected vascular areas.

[FR-5] Receive automated health recommendations or warnings.

[FR-6] Access personal analysis history and previous reports.

[FR-7] Download or export diagnostic reports (PDF/CSV).

[FR-8] Manage and update personal profile and medical information.

[FR-9] Receive notifications when AI results are ready.

[FR-10] Communicate with the assigned doctor via in-app messaging.

[FR-11] Purchase or renew analysis service packages.

[FR-12] View payment history and remaining analysis credits.

2. Doctor Functional Requirements:

[FR-13] Log in and manage assigned patient profiles.

[FR-14] Review AI analysis results and annotations.

[FR-15] Validate or correct AI-generated findings.

[FR-16] Add medical notes, diagnoses, or recommendations.

[FR-17] Access patient history, previous analyses, and trend data.

[FR-18] Filter or search patients by ID, name, or risk level.

[FR-19] Provide feedback to improve AI accuracy and model retraining.

[FR-20] Communicate with users (patients) through consultation chat.

[FR-21] View performance summaries or analysis statistics.

3. Clinic Functional Requirements:

[FR-22] Register clinic accounts and verify organization identity.

[FR-23] Manage multiple doctor and user (patient) accounts.

[FR-24] Upload and submit bulk retinal images for AI analysis.

[FR-25] Monitor all patient analysis reports and aggregated risk data.

[FR-26] Generate clinic-wide reports for screening campaigns.

[FR-27] Track number of images analyzed and package usage.

[FR-28] Purchase or renew clinic-level service packages.

[FR-29] Receive alerts for high-risk patients or abnormal trends.

[FR30]4.3. Export summarized statistics for clinical research or management.

4. Admin Functional Requirements:

[FR-31] Manage user, doctor, and clinic accounts (enable, disable, edit).

[FR-32] Define and update user roles and access permissions.

[FR-33] Configure AI parameters, thresholds, and retraining policies.

[FR-34] Manage service packages, pricing, and billing models.

[FR-35] Access global dashboard showing usage, revenue, and AI performance.

[FR-36] View system analytics (image count, risk distribution, error rates).

[FR-37] Handle data compliance, audit logs, and privacy settings.

[FR-38] Approve or suspend clinic registrations.

[FR-39] Manage notification templates and communication policies.

● Non-functional requirement:

1. Performance Requirements:

[NFR-1] AI analysis for a single retinal image must complete within 10–20 seconds, depending on image size and model load.

[NFR-2] The system must support bulk processing (≥100 images per batch) with queued or parallel execution.

[NFR-3] Dashboard and result retrieval should load in <3 seconds under normal network conditions.

2. Reliability & Availability Requirements:

[NFR-4] System uptime must be ≥ 99% excluding scheduled maintenance.

[NFR-5] AI Engine must fail gracefully; if analysis fails, the system returns a clear error and preserves all uploaded images.

[NFR-6] Data must be backed up automatically at least once daily.

3. Scalability Requirements:

[NFR-7] The architecture must allow horizontal scaling of AI microservices to handle increased image volume.

[NFR-8] Must support multiple clinics and thousands of users without performance degradation.

4. Security & Privacy Requirements:

[NFR-9] All patient data must be encrypted at rest and in transit (TLS 1.2+; AES-256).

[NFR-10] The system must comply with medical data protection standards (HIPAA-like practices / local health data laws).

[NFR-11] Sensitive data must be anonymized before being used for AI model retraining.

[NFR-12] Access must follow role-based access control (RBAC) for Admin, Clinic, Doctor, and User.

5. Usability Requirements:

[NFR-13] Web UI should be accessible and responsive across desktop, tablet, and mobile.

[NFR-14] Clinicians must be able to upload images and view results with no more than 3 clicks.

[NFR-15] Annotated images and risk explanations must be clear and clinically interpretable.

6. Maintainability Requirements:

[NFR-16] AI models, thresholds, and configurations must be updatable without system downtime.

[NFR-17] Codebase must follow modular architecture:

+AI Core Microservice

+Web Application

+Admin/Clinic/Doctor modules

+Database layer

[NFR-18] Logging, auditing, and error tracking must be centralized.

7. Interoperability Requirements:

[NFR-19] Must support integration with common retinal fundus cameras (via cloud upload).

[NFR-20] Export formats must include PDF, CSV, and standardized medical formats where possible.

[NFR-21] AI engine must communicate over standard RESTful API endpoints.

8. Data Quality & Explainability Requirements:

[NFR-22] AI outputs must include explainable elements (heatmaps, annotated vessels, highlighted abnormalities).

[NFR-23] System must track AI version and thresholds attached to each generated report to ensure traceability.

(*) 3.2. Main proposal content (including result and product)

a. Theory and practice (document):

-Students are expected to apply the software development process and UML 2.0 for system modeling.

-Documentation includes User Requirements, Software Requirements Specifications, Architecture Design, Detail Design, System Implementation, Testing Document, Installation Guide, Source Code and deployable software packages.

-Server-side technologies:

+Server: Python, Docker, Supabase, Cloudinary, VPS,…

+AI Core: Python

+Database: PostgreSQL, MongoDB, …

-Client-side technologies:

+Web Client: React + TypeScript.

+Mobile: Flutter (optional).

b. Products:

- AI Core Microservice API.

- Clinical Decision Support (CDS) Web Application.

- Admin/Doctor/Client Management Web Application.

- Integrate Retinal Fundus Camera.

c. Proposed Tasks:

-Task package 1: Design UI Elements for the Web Application

-Task package 2: Develop API for the System

-Task package 3: Develop the Web Application

-Task package 4: Build, Deploy, and Test the System

-Task package 5: Prepare Required Documents:

+System Analysis and Design

+Test Plan

+Installation Manual

+User Manual

-Each work group may have many students participating but there will be one member responsible for the main responsibility·

-Notice: all students are required to understand the reference documents thoroughly and may need to explain to the viva committee.


4. Other comments (propose all relative things if have).
