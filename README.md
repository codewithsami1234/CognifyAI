# Cognify AI 🧠
### An Offline-Capable Mobile Multi-Agent Retrieval-Augmented Generation Application for Personalized Learning and Assessment

<p align="center">
  <strong>Learn Smarter. Understand Deeper. Assess Better.</strong>
</p>

<p align="center">
  An AI-powered, offline-first mobile learning application that transforms personal study materials into an interactive, intelligent, and personalized learning experience.
</p>

---

## 📌 Project Overview

**Cognify AI** is an offline-capable, AI-powered mobile learning and assessment application designed to make personalized education more accessible, interactive, and intelligent.

The application enables students to upload their study materials, extract and organize educational content, retrieve relevant information, interact with an AI tutor, generate assessments, and receive personalized learning recommendations.

Unlike traditional learning applications that depend entirely on cloud-based AI services, Cognify AI follows an **offline-first architecture**, using on-device artificial intelligence and local data storage to support learning without requiring a continuous internet connection.

The system integrates a lightweight Large Language Model (LLM), Retrieval-Augmented Generation (RAG), document intelligence, assessment generation, and personalized learning assistance into a single mobile application.

The primary objective is to provide students with an intelligent personal learning companion that understands their study materials and supports their individual learning needs.

## 🎯 Project Objectives

The major objectives of Cognify AI are:

- Develop an intelligent mobile learning application using on-device AI.
- Enable students to study their personal documents without depending on cloud AI services.
- Implement Retrieval-Augmented Generation (RAG) for context-aware answers.
- Provide an interactive AI tutor based on uploaded study materials.
- Generate quizzes and assessments from educational content.
- Analyze student performance and identify knowledge gaps.
- Provide personalized learning recommendations.
- Maintain study materials, learning progress, and assessment history locally.
- Support offline learning after the required models and resources have been downloaded.

## ✨ Key Features

### 1. Document Intelligence

The Document Intelligence module allows students to import and process their study materials.

**Capabilities:**
- Import supported TXT documents.
- Extract text from digital PDF documents.
- Process scanned documents and images using OCR.
- Clean and normalize extracted text.
- Divide documents into smaller text chunks.
- Prepare document content for indexing and retrieval.
- Organize extracted educational information into a local knowledge library.

**Purpose:** Convert unstructured study materials into usable knowledge that other AI modules can understand and process.

### 2. Knowledge Retrieval (RAG)

The Knowledge Retrieval module uses Retrieval-Augmented Generation to retrieve relevant information from a student's personal study materials.

**Capabilities:**
- Process and index document chunks.
- Retrieve relevant passages based on user queries.
- Provide context to the local language model.
- Generate answers grounded in available study content.
- Reduce irrelevant or unsupported responses.
- Support document-based question answering.

**RAG Workflow:**

1. Student imports a document.
2. Document Intelligence extracts its content.
3. Content is divided into manageable chunks.
4. Chunks are indexed in the local retrieval system.
5. Student submits a question.
6. The retrieval engine identifies relevant content.
7. Retrieved context is passed to the local LLM.
8. The LLM generates a context-aware response.

### 3. AI Tutor

The AI Tutor provides an interactive learning experience using the student's study materials.

**Capabilities:**
- Answer questions about uploaded documents.
- Explain difficult concepts in simpler language.
- Provide topic-based explanations.
- Support follow-up learning questions.
- Generate contextual responses using retrieved information.
- Help students understand rather than simply memorize information.

The AI Tutor combines knowledge retrieval with on-device language generation to provide personalized academic assistance.

### 4. Assessment Module

The Assessment module helps students evaluate their understanding of educational material.

**Capabilities:**
- Generate questions from study content.
- Create objective-style assessments.
- Present interactive quizzes.
- Evaluate submitted answers.
- Calculate assessment scores.
- Provide feedback on responses.
- Identify areas that require further study.

The objective is to make self-assessment easier and help students understand their learning progress.

### 5. Learning Coach

The Learning Coach focuses on personalized learning guidance and improvement.

**Capabilities:**
- Analyze assessment performance.
- Identify weak and strong knowledge areas.
- Highlight topics that need additional attention.
- Provide personalized study recommendations.
- Suggest learning priorities.
- Maintain learning-related progress and history.

The Learning Coach uses available learning and assessment information to help students make better study decisions.

---

## 🏗️ System Architecture

Cognify AI follows a modular, offline-first mobile architecture.

The application separates the mobile interface, local data management, document processing, retrieval, and AI inference into distinct functional layers.

```text
                  COGNIFY AI
                      |
          React Native Mobile App
                      |
             Application Layer
                      |
       +--------------+--------------+
       |              |              |
   Document       Knowledge       Learning
 Intelligence     Retrieval        Modules
       |              |              |
       |              |       +------+------+
       |              |       |      |      |
      OCR          Local      AI   Assessment Learning
   Processing     Retrieval  Tutor            Coach
       |              |
       +--------------+
                      |
               Local AI Engine
                      |
             llama.cpp / llama.rn
                      |
              On-Device LLM
                      |
               Local Database
                   SQLite
                      |
              Offline Learning
```

### Architecture Layers

| Layer | Responsibility |
|---|---|
| Presentation Layer | Mobile interface and user interactions |
| Application Layer | Coordinates the five learning modules |
| Document Processing | Extracts, cleans, and prepares study content |
| Retrieval Layer | Retrieves relevant document context |
| AI Inference Layer | Generates responses using a local LLM |
| Storage Layer | Stores documents and learning data locally |
| Learning Layer | Supports assessment and personalized recommendations |

---

## 🧠 AI and Machine Learning Architecture

Cognify AI uses a lightweight, locally executed language model to support AI-powered learning features.

### Local Language Model

The primary model selected for the application is:

**Meta Llama 3.2 1B Instruct**

The application uses `llama.rn` and the underlying `llama.cpp` inference engine to execute language model inference on supported mobile devices.

A smaller **Qwen2.5-0.5B** model is also included in the planned fallback model strategy.

### Model Responsibilities

- Answer educational questions.
- Explain concepts.
- Generate learning-related content.
- Support assessment generation.
- Assist personalized learning workflows.

### Why On-Device AI?

Traditional AI applications frequently send user content to remote servers for processing.

Cognify AI aims to minimize this dependency through local inference.

Benefits include:

- Reduced dependence on cloud AI APIs.
- Improved privacy through local processing.
- Availability of AI features without continuous internet access.
- Greater control over personal learning materials.
- Reduced recurring cloud inference costs.

**Important:** Initial model setup and downloading model files may require internet access. Offline functionality is available after the required resources have been installed and initialized.

---

## 🔍 Retrieval-Augmented Generation (RAG)

RAG is one of the central components of Cognify AI.

It combines document retrieval with language generation so that AI responses can use information from the student's own learning materials.

### RAG Processing Pipeline

```text
       Study Documents
              |
              v
      Document Extraction
              |
              v
       Text Preprocessing
              |
              v
         Text Chunking
              |
              v
       Local Knowledge Index
              |
       Student's Question
              |
              v
       Context Retrieval
              |
              v
       Retrieved Passages
              |
              v
       Local Language Model
              |
              v
       Contextual AI Answer
```

### Benefits of RAG

- Answers are informed by uploaded study materials.
- Students can ask questions about their own documents.
- Relevant passages can provide additional context.
- The system can reduce dependence on general model knowledge.
- Learning becomes more document-specific and personalized.

---

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| React Native | Cross-platform mobile application |
| TypeScript | Application development |
| SQLite | Local database and persistent storage |
| llama.rn | On-device LLM integration |
| llama.cpp | Local language model inference engine |
| Llama 3.2 1B Instruct | Primary language model |
| Qwen2.5-0.5B | Alternative lightweight model |
| OCR | Text extraction from scanned documents and images |
| RAG | Context-aware knowledge retrieval |
| Android | Primary mobile deployment and testing platform |

---

## 📱 Application Modules

| Module | Main Function | Expected Output |
|---|---|---|
| Document Intelligence | Document extraction and processing | Structured study content |
| Knowledge Retrieval | Search relevant study information | Relevant document passages |
| AI Tutor | Interactive educational assistance | Contextual explanations |
| Assessment | Knowledge evaluation | Questions, scores, feedback |
| Learning Coach | Learning performance analysis | Personalized recommendations |

---

## 🔐 Privacy and Offline-First Design

Privacy and offline accessibility are important design considerations in Cognify AI.

The application is designed to keep its core learning workflow available locally.

Key principles:

- Local document processing where supported.
- On-device language model inference.
- Local SQLite persistence.
- No mandatory cloud AI API for the core inference workflow.
- Access to previously imported learning materials without continuous connectivity.
- Reduced exposure of personal educational content to external services.

Offline support depends on successful model installation, local storage availability, and device compatibility.

---

## 📂 Supported Learning Content

The document-processing workflow is designed around the following input types:

| File Type | Processing |
|---|---|
| TXT | Native text extraction |
| Digital PDF | PDF text extraction |
| Scanned PDF | OCR-based extraction where supported |
| Images | OCR-based text extraction |

DOCX, PPTX, and additional semantic document-processing formats are optional extensions rather than guaranteed core support.

---

## ⚙️ Installation and Setup

### Prerequisites

Before setting up Cognify AI, ensure that you have:

- Node.js installed.
- npm installed.
- Android Studio installed.
- Android SDK configured.
- Java development environment configured.
- A compatible Android device or emulator.
- Sufficient storage for local AI model files.

A physical Android device with sufficient RAM and available storage is recommended for testing local model inference.

### 1. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
```

### 2. Navigate to the Project

```bash
cd CognifyAI
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure the Android Environment

Ensure Android Studio, the Android SDK, and required environment variables are configured.

### 5. Start the Development Server

```bash
npx react-native start
```

### 6. Run the Android Application

Open another terminal:

```bash
npx react-native run-android
```

**Note:** These are standard React Native setup commands. Verify the actual repository scripts, native configuration, and model setup instructions before using them. The exact commands may differ depending on the project's current build configuration.

---

## 📴 Offline Functionality

Cognify AI is designed to support an offline-first learning workflow.

The intended offline workflow is:

1. Install the application.
2. Download or configure the required local language model.
3. Import study materials.
4. Process and store documents locally.
5. Build or update the local knowledge index.
6. Disconnect from the internet.
7. Ask questions using the AI Tutor.
8. Retrieve previously indexed learning content.
9. Complete supported assessments.
10. Access locally saved learning information.

The offline workflow depends on the availability of the required model files, initialized local storage, and supported document-processing dependencies.

---

## 🧪 Testing and Evaluation Strategy

Cognify AI is evaluated through functional testing, retrieval evaluation, document-processing tests, and real-device testing.

### 1. Document Intelligence Testing

- TXT extraction.
- Digital PDF extraction.
- OCR on scanned documents.
- Text preprocessing.
- Document persistence.
- Error handling for unsupported or invalid files.

### 2. Knowledge Retrieval Evaluation

The planned retrieval evaluation uses a test set of 30 questions.

**Primary metric: Hit@3**

Hit@3 measures whether at least one relevant document passage appears among the top three retrieved results.

\[
Hit@3 = \frac{\text{Queries with a relevant result in top 3}}{\text{Total queries}}
\]

### 3. OCR Evaluation

A test set of 10 scanned pages is planned to evaluate:

- Text extraction quality.
- Recognition of printed text.
- Handling of document layouts.
- OCR preprocessing.
- Extraction failures.

### 4. Offline Testing

The offline test procedure includes:

1. Complete initial model and resource setup.
2. Import and process study documents.
3. Enable airplane mode.
4. Test document access.
5. Test local retrieval.
6. Test AI Tutor responses.
7. Test supported assessments.
8. Verify persistence after restarting the application.

### 5. Device Testing

The application is intended to be tested on physical Android devices, including the Realme RMX3085 test device.

Performance evaluation should consider:

- Model loading time.
- Memory consumption.
- Response generation time.
- Application stability.
- Database operations.
- Battery usage.
- Offline functionality.

---

## 🚀 Future Improvements

Potential future enhancements include:

- More efficient document indexing.
- Improved retrieval relevance.
- Additional lightweight language models.
- Improved multilingual educational assistance.
- More advanced learning analytics.
- Enhanced assessment personalization.
- Better OCR accuracy.
- Optimized model inference for low-resource devices.
- Additional document formats.
- Improved user experience and accessibility.

---

## 🎓 Academic Project Information

**Project Name:** Cognify AI

**Project Title:** An Offline-Capable Mobile Multi-Agent Retrieval-Augmented Generation Application for Personalized Learning and Assessment.

**Project Type:** Final Year Project (FYP)

**Degree:** Bachelor of Science in Information Technology (BSIT)

**Development Platform:** Android / React Native

**Project Focus:**
- Artificial Intelligence
- Machine Learning
- Large Language Models
- Retrieval-Augmented Generation
- Natural Language Processing
- Mobile Application Development
- Personalized Learning
- Offline AI Systems

---

## 👩‍💻 Development Team

**Project Developers:**
- Rahma
- Taiba

**Project Supervisor:**
- Professor Waqas Ali

---

## 🌟 Project Vision

Cognify AI aims to make personalized AI-powered education more accessible by bringing intelligent learning capabilities directly to students' mobile devices.

By combining document intelligence, knowledge retrieval, on-device language models, interactive tutoring, assessments, and personalized learning guidance, Cognify AI creates a unified environment where students can learn from their own materials, evaluate their understanding, and improve their academic performance.

**Cognify AI — Your Personal AI Learning Companion.**

---

## 📄 License

Add the appropriate open-source license before publicly distributing the project.

If no license has been selected, all rights remain with the respective copyright holders by default.

---

<p align="center">
  <strong>Built with ❤️ for Smarter and More Accessible Learning.</strong>
</p>
