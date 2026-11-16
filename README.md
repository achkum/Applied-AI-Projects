# AI and Machine Learning Projects

I am **Achyuth Kumar Baddela**, a tech lead with more than 10 years in software and an MSc student in Applied Artificial Intelligence at Luleå University of Technology, based in Stockholm.

I started in test automation at **Infosys** and **Deloitte Consulting**, moved into development at **SEB**, and now lead a team there. Alongside the master's, I build AI products end to end: from privacy-first apps that keep personal data on the device to platforms that make LLM applications secure, reliable and cheaper to run.

---

## Try them live

| Project | Live | Code |
|---|---|---|
| Breast Cancer Decision Support | [ai-breastcancer-detector.vercel.app](https://ai-breastcancer-detector.vercel.app/) | [BreastCancerDetection](./BreastCancerDetection) |
| Cutok | [cutok.vercel.app](https://cutok.vercel.app) | [TokenOptimizer](./TokenOptimizer) |
| Drift | [drift-inky-alpha.vercel.app](https://drift-inky-alpha.vercel.app) (sample data) | [achkum/Drift](https://github.com/achkum/Drift) |
| SubTrack | [Clickable wireframe](https://achkum.github.io/Applied-AI-Projects/SubTrack/docs/subtrack-wireframe.html) | [SubTrack](./SubTrack) |

---

## Products and Personal Projects

| Project | Summary | Tech Stack |
|---|---|---|
| [Keel](https://github.com/achkum/keel-ai-platform) | Open-source AI engineering platform, in early development. One versioned spec defines a whole LLM application across eight layers, and an evaluation gate blocks every change until its quality, attack and load tests pass. | Python, Pydantic, Typer, FastAPI, OpenTelemetry, MCP |
| [Drift](https://github.com/achkum/Drift) | Shows how social feeds shift what people watch by separating what the platform served from what the user chose, using their own YouTube, TikTok or Instagram export. All analysis runs on the device. 86.5% served-vs-chosen accuracy on simulated histories (best baseline 80.7%). [Live demo](https://drift-inky-alpha.vercel.app) | Next.js, TypeScript, transformers.js, Expo |
| [Cutok (TokenOptimizer)](./TokenOptimizer) | Reduces LLM token cost before a request is sent through attachment minification, context deduplication, prompt compression and response budgeting. Available as a Python library, web app, browser extension, MCP server and proxy. [Live demo](https://cutok.vercel.app) | Python, LLMLingua-2, FastAPI, MCP, Vercel |
| [SubTrack](./SubTrack) | Household subscription tracker for the Swedish market. Detects recurring payments from Open Banking data with ML classifiers, flags price increases and splits shared costs. [Clickable wireframe](https://achkum.github.io/Applied-AI-Projects/SubTrack/docs/subtrack-wireframe.html) | TypeScript, NestJS, Next.js, Expo, FastAPI, PostgreSQL, Redis |
| [ComplianceIntelligence](./ComplianceIntelligence) | AML and sanctions intelligence system using RAG over regulatory documents, with delta analysis to surface risk changes between document versions. | FastAPI, Gemini, ChromaDB, SQLAlchemy, Tesseract OCR |
| [Workflow Automation](./Workflow%20Automation) | Email analysis and routing pipeline that reads Gmail, uses an LLM for priority, sentiment and team routing, and orchestrates runs with n8n. | FastAPI, Gemini, n8n, Docker, SQLite |
| [Defect Prediction](./Defect%20Prediction) | Predicts defective software modules from code complexity metrics on the NASA MDP dataset, comparing Logistic Regression, Random Forest and XGBoost. | Python, Scikit-Learn, XGBoost, Pandas |

---

## Course Projects

Projects from the MSc in Applied Artificial Intelligence at Luleå University of Technology.

| Project | Course | Summary | Tech Stack |
|---|---|---|---|
| [Breast Cancer Decision Support](./BreastCancerDetection) | AI within the Healthcare System | Classifies histopathology images with ResNet50, explains predictions with Grad-CAM, and exposes the model as MCP tools for a conversational agent. Cases near the decision threshold are flagged for human review. Released through a CI evaluation gate. [Live demo](https://ai-breastcancer-detector.vercel.app/) | PyTorch, FastAPI, MCP, Gemini, Next.js, GCP Cloud Run |
| [Edge-Ready ECG Classification](./ECGEdgeClassification) | D7043E Advanced Data Mining | Inter-patient heartbeat classification on MIT-BIH with a 10k-parameter 1D CNN, quantised to INT8 and synthesised for the MAX78002 edge AI chip. Macro F1 0.664 against 0.475 for a 20x larger Random Forest. Follows all six CRISP-DM stages. | PyTorch, Scikit-Learn, ai8x toolchain |
| [Credit Card Fraud Detection](https://github.com/achkum/AI-portfolio/tree/main/cc_fraud_detection) | Data Science Programming | Compares unsupervised anomaly detectors (Autoencoder, VAE, One-Class SVM) with supervised models and hybrid stacking on a highly imbalanced dataset. Best AUPRC 0.84; 84% of frauds caught at 0.1% FPR. | PyTorch, Scikit-Learn, XGBoost |
| [Anchor-Based Object Recognition](./AnchorObjectRecognition) | R7020E Computer Vision and Image Processing | Finds and localises a specific object in video from three anchor photos, comparing HSV histograms, SIFT and frozen DINOv2 embeddings, with depth cues to reject printed decoys. | OpenCV, DINOv2, PyTorch |
| [SNN Motion Detection](./SNNMotionDetection) | D7046E Neural Networks and Learning Machines | Motion-direction classification with spiking neural networks, comparing LIF networks, Reichardt detectors and STDP learning on synthetic data and DVS128 Gesture. 94.4% accuracy on 11-class DVS128 Gesture. | snnTorch, Brian2, PyTorch |
| [Car Detection in Snow](./SnowCarDetection) | D7047E Advanced Deep Learning | YOLOv9 car detection on the Nordic Vehicle Dataset with a custom snow augmentation pipeline, domain-shift evaluation and Optuna hyperparameter tuning. | YOLOv9, Ultralytics, Optuna, W&B |

---

## Technical Skills

**Programming:** Python, TypeScript, Java, SQL  
**Machine Learning & Deep Learning:** PyTorch, Scikit-Learn, XGBoost, TensorFlow, Keras, YOLO, DINOv2, snnTorch, INT8 quantisation  
**LLMs & Agents:** RAG, Model Context Protocol (MCP), LLM gateways and routing, GitHub Copilot custom agents and skills, multi-agent orchestration, Google Gemini, LLMLingua-2, LangChain, ChromaDB  
**Data & Visualization:** Pandas, NumPy, Matplotlib, Seaborn  
**On-device AI:** transformers.js, local-first storage (IndexedDB, SQLite), quantised models for edge hardware  
**Backend & Frontend:** FastAPI, Spring Boot, NestJS, Next.js, React Native (Expo), SQLAlchemy, Prisma, PostgreSQL, Redis, Kafka  
**Cloud & MLOps:** Docker, Kubernetes, OpenShift, GCP (Cloud Run, GCS), Vercel, GitHub Actions, Jenkins, MLflow, Optuna, Weights & Biases  
**Testing & Automation:** ISTQB Foundation, test automation frameworks, Selenium, Playwright, JUnit, API testing, n8n  
**Methodologies:** Agile, Scrum, SAFe, V-Model, Waterfall, CRISP-DM

---

## Contact

**LinkedIn:** [linkedin.com/in/baddelaachyuth](https://www.linkedin.com/in/baddelaachyuth/)  
**Email:** baddela3@gmail.com  
**Location:** Stockholm, Sweden
