---
title: "AWS AI Practitioner (AIF-C01): 14-Day Study Plan, Exam Guide, and Free Mock"
description: "How to pass the AWS Certified AI Practitioner exam: cost and vouchers, the five domains, how hard it is, AI vs Cloud Practitioner, a 14-day plan, a services cheat sheet, and a free 65-question mock."
track: aws
order: 2
difficulty: beginner
estMinutes: 25
updatedDate: 2026-09-06
tags: ["aws", "certification", "aif-c01", "ai-practitioner", "generative-ai", "bedrock"]
seoTitle: "AWS AI Practitioner (AIF-C01) 14-Day Study Plan"
metaDescription: "AIF-C01 in 14 days: exam cost and vouchers, the five domains, difficulty, AI vs Cloud Practitioner, a daily plan, cheat sheet, and a free 65-question mock."
faqs:
  - q: "What is the passing score for the AWS AI Practitioner exam?"
    a: "700 on a scaled range of 100 to 1,000. AWS does not publish a raw-percentage equivalent, because scaling adjusts for differences between exam forms. Scoring consistently above 80% on practice tests is a safe margin."
  - q: "What is the AWS AI Practitioner exam code?"
    a: "AIF-C01. It is the exam for the AWS Certified AI Practitioner certification, a foundational-level credential."
  - q: "How many questions are on the AIF-C01 exam, and how many count?"
    a: "65 questions in 90 minutes. Only 50 are scored; the other 15 are unscored items AWS is trialling, and they are not identified on the exam."
  - q: "Does the AWS AI Practitioner exam require coding?"
    a: "No. The exam guide explicitly places developing or coding models, feature engineering, hyperparameter tuning, and building pipelines out of scope. Questions test concepts and service selection."
  - q: "Are there prerequisites for the AWS AI Practitioner certification?"
    a: "No formal prerequisites. AWS recommends up to six months of exposure to AI and ML on AWS and familiarity with core services, IAM, the shared responsibility model, and pricing basics. You do not need Cloud Practitioner first."
  - q: "How long is the AWS AI Practitioner certification valid?"
    a: "Three years. You can recertify by passing the current version of the exam or by earning the AWS Certified Machine Learning Engineer – Associate."
  - q: "Is the AWS AI Practitioner certification worth it?"
    a: "For most people in or adjacent to tech who need credible AI literacy, yes: it costs USD 100 (less with the current promotion), takes 30 to 40 hours to prepare for, and covers the concepts and AWS services that show up in real projects. Senior ML engineers will find it too basic and should look at MLA-C01 instead."
  - q: "Should I take AI Practitioner or Cloud Practitioner first?"
    a: "Neither is a prerequisite for the other. Take Cloud Practitioner first if you are new to AWS and want a general cloud role. Take AI Practitioner first if you already know AWS basics or your work is AI-focused. Until 30 September 2026, passing AIF-C01 earns a free Cloud Practitioner voucher, which makes AI first the cheaper order."
---

A study plan for the AWS Certified AI Practitioner exam written for someone with no AI, ML, or AWS background, at one to one and a half hours a day. One main course, one question bank, this guide, and a free full-length mock. Everything here follows **exam guide version 1.1, published 30 April 2026**, which added agentic AI, Amazon Bedrock AgentCore, Kiro, Strands Agents, and Amazon Nova to the syllabus and dropped several services that older study material still teaches. If a resource you are using does not mention agents or AgentCore, it predates the current exam.

When you are ready to test yourself, the [free 65-question AIF-C01 mock](/tests/aws-ai-practitioner/) on this site follows the real domain weighting and explains every answer.

## Exam at a glance

| Fact | Detail |
|---|---|
| **Exam code** | AIF-C01 (AWS Certified AI Practitioner) |
| **Questions** | 65 (50 scored + 15 unscored, not identified) |
| **Duration** | 90 minutes (about 83 seconds per question) |
| **Passing score** | 700 on a scaled range of 100–1,000 |
| **Cost** | USD 100 (50% off until 30 September 2026, see below) |
| **Validity** | 3 years |
| **Delivery** | Pearson VUE test centre or OnVUE online proctoring |
| **Question types** | Multiple choice, multiple response, ordering, matching |
| **Hands-on or coding** | None |
| **Current exam guide** | Version 1.1, 30 April 2026 |

### Domain weights

| Domain | Weight | ≈ Scored questions |
|---|---|---|
| 1 · Fundamentals of AI and ML | 20% | 10 |
| 2 · Fundamentals of generative AI | 24% | 12 |
| 3 · Applications of foundation models | 28% | 14 |
| 4 · Guidelines for responsible AI | 14% | 7 |
| 5 · Security, compliance, and governance for AI solutions | 14% | 7 |

> **Key:** 52% of the exam is generative AI and foundation models. Amazon Bedrock is the centre of the exam: its features (Knowledge Bases, Agents, Guardrails, model choice, Prompt Management) and the *prompt engineering vs RAG vs fine-tuning vs distillation* decision are the most frequently tested topics. Since the 2026 update, agentic AI (AgentCore, Strands Agents, the Model Context Protocol) sits alongside them. Spend your time there.

Questions are scenario-based: "A company needs to do X with the least operational overhead. Which service?" Memorising definitions is not enough; you need to know *when* to use each service and each approach.

## Is the AWS AI Practitioner worth it, and who is it for

AWS wrote AIF-C01 for people who **use** AI on AWS rather than build it: analysts, product managers, project leads, sales engineers, and developers who need to talk credibly about AI and pick the right service. The target candidate has up to six months of exposure to AI and ML on AWS, and the exam guide puts model development, feature engineering, hyperparameter tuning, and pipeline building explicitly out of scope.

It is worth taking if you fit that description. The exam costs USD 100, half that under the current promotion, needs roughly 30 to 40 hours of preparation, and the syllabus is a well-organised tour of the concepts and services that appear in real generative AI projects. Recruiters and managers recognise the AWS badge, and in 2026 an AI credential differentiates a CV more than the far more common Cloud Practitioner.

It is not worth taking if you are already a working ML engineer or data scientist. You will find it too basic, and the AWS Certified Machine Learning Engineer – Associate (MLA-C01) is the credential that reflects your skills. The AI Practitioner rarely changes a salary band on its own; it amplifies whatever role you already have by adding demonstrable AI literacy.

## How hard is the AIF-C01, and how long does it take to prepare

It is a foundational exam and the easiest of the AWS AI certifications. There is no code, no maths, and no console work. The difficulty is vocabulary and discrimination: the exam uses a large set of terms (tokens, embeddings, RAG, RLHF, distillation, MCP) and a large set of similar-sounding services, and asks you to pick the right one for a scenario under time pressure.

Plan on **14 days at one to one and a half hours a day** if you are new to both AI and AWS, which is the schedule below. If you already work with AWS, one week is enough, and if you already work with generative AI tools, three to five days of service-mapping and practice tests will do.

Two facts about scoring shape how you should prepare. First, 83 seconds per question means you cannot deliberate; the qualifier words in the stem ("least operational overhead", "most cost-effective", "no ML expertise", "full control") decide the answer, and you should learn to spot them. Second, the 700 pass mark is a scaled score, and AWS does not publish a raw-percentage equivalent. Treat consistent scores above 80% on realistic practice tests as the signal that you are ready.

## Exam cost, discounts, and free vouchers

The list price is **USD 100**, charged through Pearson VUE in your local currency at Pearson's exchange rate, plus any local tax. In India, for example, the fee is billed in INR with GST added.

**Until 30 September 2026 the exam is 50% off, and passing it earns a free Cloud Practitioner exam.** The promotion code is `AIF2CLOUD`. The terms: register for AIF-C01 between 26 May and 30 September 2026, pass by 30 September 2026 at 23:59 local time, and you receive a voucher for the AWS Certified Cloud Practitioner (CLF-C02) exam to be used by 30 November 2026. One per person, only for exams in pass status, and it cannot be combined with other offers.

Two standing benefits also apply. After you pass any AWS certification exam you receive a 50% discount voucher toward your next one, so AIF-C01 is a cheap way to halve the cost of an associate exam later. And AWS Skill Builder offers the official exam-prep plan and a 20-question official practice set free of charge.

Note for non-English candidates: the Italian and German versions of the exam are retired after 15 October 2026. English, French, Spanish, Portuguese, Japanese, Korean, Chinese, and Arabic remain available.

## AI Practitioner vs Cloud Practitioner: which first

Neither exam is a prerequisite for the other. They share a format (65 questions, 90 minutes, 700 to pass, USD 100) and a level, and they differ in subject.

| | AWS Certified Cloud Practitioner (CLF-C02) | AWS Certified AI Practitioner (AIF-C01) |
|---|---|---|
| **What it covers** | Cloud concepts, core services (EC2, S3, VPC, IAM), billing, security basics | AI/ML and GenAI concepts, Bedrock, SageMaker AI, agentic AI, responsible AI, AI security |
| **Best for** | Career switchers into cloud; anyone new to AWS | People in AI-adjacent roles; anyone who already knows AWS basics |
| **Recognition** | The most widely held AWS credential | Newer and rarer, so it differentiates more |
| **Assumed knowledge** | None | Familiarity with core services, IAM, shared responsibility, pricing |

Take **Cloud Practitioner first** if you are switching careers into cloud and have never used AWS. You cannot reason about Bedrock security or vector stores without knowing what a VPC, an IAM role, or an S3 bucket is, and CLF-C02 is what entry-level cloud job postings ask for.

Take **AI Practitioner first** if you already have some AWS exposure, or if your job is about AI rather than infrastructure. Until 30 September 2026 this is also the cheaper order: pass AIF-C01 at half price and Cloud Practitioner is free.

### AWS AI Practitioner vs Microsoft Azure AI Fundamentals (AI-900)

AI-900 is Microsoft's equivalent foundational AI exam: about USD 99, no prerequisites, and a similar mix of AI and ML concepts with Azure services in place of AWS ones. The concepts transfer almost entirely; the service names do not. Choose by the cloud your organisation runs. If you are undecided, AIF-C01 currently has the richer generative AI and agentic AI coverage, and AWS's promotion makes it cheaper.

### AWS AI Practitioner vs Google Cloud Generative AI Leader

Google's Generative AI Leader certification, launched in 2025, is aimed at business leaders rather than practitioners: it is about USD 99, focuses on generative AI strategy and Google Cloud's Gemini and Vertex AI offerings, and contains little classical ML. AIF-C01 is broader, covering traditional ML fundamentals, responsible AI, and security in more depth. Pick Google's exam if your organisation is a Google Cloud shop and your role is strategic; pick AIF-C01 for a more technical foundation.

### AWS AI Practitioner vs AWS Machine Learning Engineer – Associate (MLA-C01)

MLA-C01 is the next step up, not an alternative. It is an associate-level, hands-on exam (about USD 150, 65 questions, 130 minutes) covering data preparation, model training and tuning, deployment, and MLOps on SageMaker AI. It assumes you build and operate ML systems. Take AIF-C01 first if you are new to AI; go straight to MLA-C01 if you already do ML engineering. Passing MLA-C01 also renews an AI Practitioner certification.

## The 14-day plan

Week one is concepts, week two is practice. The plan assumes Stephane Maarek's Udemy course (about 10 hours); any current course works, so map its sections to the days below. Check that the course you pick covers AgentCore, Strands Agents, and the Model Context Protocol; if it does not, supplement those topics from this guide.

### Week 1: concepts

| Day | Focus | What to do |
|---|---|---|
| **1** | Setup and AI/ML basics | Skim the official exam guide (15 minutes). Course: intro, AI vs ML vs deep learning vs generative AI vs agentic AI, supervised / unsupervised / reinforcement learning. Read Domain 1 below. |
| **2** | ML lifecycle and AWS AI services | Data → train → evaluate → deploy → monitor. SageMaker AI overview. Rekognition, Comprehend, Textract, Transcribe, Polly, Translate, Lex, Personalize. Note which services are *not* on the 2026 in-scope list. |
| **3** | Generative AI fundamentals | Tokens, embeddings, transformers, diffusion models, foundation models, context window, inference parameters, token-based pricing. Domain 2 concepts. |
| **4** | Prompt engineering and Bedrock | Zero-shot, few-shot, chain-of-thought, negative prompts, prompt injection, context engineering. Open the Bedrock console (free tier) or spend 20 minutes in PartyRock changing prompts and temperature. |
| **5** | RAG, Knowledge Bases, agents | End-to-end RAG flow, chunking, vector stores. Bedrock Knowledge Bases, Guardrails, Agents. Agentic AI: MCP, memory, tool use, multi-agent patterns, AgentCore, Strands Agents. The customisation decision table. |
| **6** | Customising and evaluating FMs | Fine-tuning, continued pre-training, distillation, RLHF. Evaluation: ROUGE, BLEU, BERTScore, LLM-as-a-judge, Bedrock Model Evaluation. Prompt caching, Provisioned Throughput vs on-demand. |
| **7** | Responsible AI and security | Bias, fairness, explainability, SageMaker Clarify, Model Cards, human-in-the-loop. IAM, KMS, PrivateLink, CloudTrail, Macie, Artifact, Config, Trusted Advisor, the Generative AI Security Scoping Matrix, AgentCore Identity and Policy. |

### Week 2: practice and revision

| Day | Focus | What to do |
|---|---|---|
| **8** | **Practice test 1** (baseline) | Take the [free 65-question mock](/tests/aws-ai-practitioner/) on this site. Set a 90-minute timer yourself; the runner does not enforce one. Ignore the score. Read the explanation for every wrong *and* every guessed answer. Write a weak-topics list. |
| **9** | Revise | Re-watch the course sections for your weak topics at 1.5× speed. Read the services cheat sheet below twice. |
| **10** | **Practice test 2** | A Tutorials Dojo timed set, or the 20 official questions on AWS Skill Builder. Target 75%+. Which domain keeps failing? |
| **11** | Revise | Bedrock deep dive, agentic AI, and responsible AI again. Read the glossary. |
| **12** | **Practice test 3** | Another Tutorials Dojo set, or retake the mock here and compare against day 8. Target 80%+. Below 80%, move the exam three or four days out; there is no rush. |
| **13** | Final light revision | Notes, cheat sheet, glossary only. No new content. Confirm exam time, ID, and the Pearson system check if testing online. Sleep early. |
| **14** | **Exam day** | Arrive or log in 30 minutes early. Flag and move on. Watch for the qualifier words. |

If one and a half hours a day is too heavy, stretch week one to ten days but keep the week two structure intact. Never skip the practice tests; they raise your score more than anything else.

## Domain 1: Fundamentals of AI and ML (20%)

Pure basics: concept-heavy, service-light. Clear definitions here are easy marks.

### Concepts

- AI vs ML vs deep learning vs generative AI vs **agentic AI**: how each relates to the others
- Supervised (labelled data) vs unsupervised (clustering, anomaly detection) vs reinforcement learning (reward signal)
- Classification vs regression vs clustering; when ML is *not* appropriate (deterministic rules suffice, or an exact outcome is required)
- Inference types: batch, real-time, **asynchronous**, **serverless**
- Training vs inference; overfitting vs underfitting; bias and variance
- Data types: structured and unstructured, labelled and unlabelled, tabular, time-series, image, text
- The AI/ML pipeline: business goal → data collection → EDA → feature engineering → training → evaluation → deployment → monitoring; MLOps ideas such as repeatability, model monitoring, and retraining
- Sources of foundation models (open-source pre-trained vs custom-trained) and ways to use a model in production (managed API vs self-hosted endpoint)
- **Traditional ML vs foundation model**: when regulation, explainability, or operational constraints favour a conventional model on tabular data
- Model metrics: accuracy, precision, recall, F1 (classification), MAE and RMSE (regression); business metrics: cost per user, development cost, customer feedback, ROI

### AWS services

- **Amazon SageMaker AI**: build, train, and deploy custom models. Canvas (no-code), Ground Truth (labelling), Data Wrangler, Feature Store, Model Monitor (drift), Clarify (bias and explainability), JumpStart (model hub)
- **Rekognition** (image and video), **Textract** (text from documents), **Comprehend** (NLP: sentiment, entities, PII)
- **Transcribe** (speech → text), **Polly** (text → speech), **Translate**, **Lex** (chatbots)
- **Personalize** (recommendations)
- For the pipeline stages, the guide now also names **Amazon Bedrock**, **Amazon Quick**, and **Kiro**

> **Note:** Amazon Kendra, Amazon Forecast, Amazon Fraud Detector, and AWS Audit Manager appear in older study material but are not on the 2026 in-scope services list, and Fraud Detector is closed to new customers. Do not pick them as answers; the exam will not make them correct.

> **Tip:** Exam pattern — "The company needs to train a custom model" → SageMaker AI. "Needs a ready-made API with no ML expertise" → a managed AI service (Rekognition, Comprehend, and so on). "Needs a general-purpose text or image capability" → a foundation model in Bedrock. This distinction appears in five or six questions.

## Domain 2: Fundamentals of generative AI (24%)

This is where the real weight begins. Know a one-line meaning and one example for every term.

### Concepts

- What a foundation model (FM) is; an LLM is one type of FM; pre-training vs fine-tuning
- Tokens, tokenisation, context window, embeddings, vectors, chunking, semantic similarity
- Transformer architecture (self-attention) at a high level; diffusion models for image generation; multimodal models
- Inference parameters: temperature, top-p, top-k, max tokens, stop sequences; which increase creativity and which increase determinism
- Prompt engineering: zero-shot, one- and few-shot, chain-of-thought, prompt templates, negative prompts, system prompts
- **Context engineering**: deciding what goes into the context window (instructions, retrieved content, memory, tool results) and keeping it relevant
- **Token-based pricing** and its effect on cost and latency; prompt caching
- **Agentic AI concepts**: tool use, memory (short-term vs long-term), multi-agent and orchestrator patterns, workflow orchestration, and the **Model Context Protocol (MCP)** for connecting agents to external tools and data
- Hallucination, nondeterminism, toxicity, prompt injection and jailbreaks, and their mitigations
- GenAI use cases (summarisation, assistants, code generation, image and video generation, translation, search, recommendations) and disadvantages (hallucination, interpretability, inaccuracy, nondeterminism)
- Model selection factors: model type, performance, capabilities, constraints, compliance, cost, latency, complexity
- Business value metrics: ROI, efficiency, conversion rate, average revenue per user, customer lifetime value
- The FM lifecycle: data selection → model selection → pre-training → fine-tuning → evaluation → deployment → feedback

### AWS services

- **Amazon Bedrock**: serverless API access to FMs from Amazon (Nova), Anthropic, Meta, Mistral, Cohere, Stability AI, and others; pay per token
- **Amazon Nova**: Amazon's own family of models for text, image (Nova Canvas), and video generation
- **Amazon Bedrock AgentCore**: the managed platform to run agents in production
- **Strands Agents**: AWS's open-source SDK for building agents in code
- **Kiro**: AWS's agentic IDE for planning and writing code
- **Amazon Quick** (formerly QuickSight): business intelligence with natural-language questions and agentic workflows
- **Amazon Q Business** and **Amazon Q Developer**: enterprise assistant over company data; developer assistant for code and AWS
- **SageMaker JumpStart**: deploy open-source FMs onto your own endpoint (more control, more effort than Bedrock)
- **AWS Transform**: agentic migration and modernisation of legacy workloads
- **PartyRock**: a free Bedrock playground that needs no AWS account (Apple, Google, or Amazon login). Useful for learning; no longer named in the exam guide

| Temperature ↑ | Temperature ↓ (near 0) |
|---|---|
| More random and creative. Marketing copy, brainstorming. | Deterministic and factual. Extraction, classification, code. |

### Agentic AI on AWS

The April 2026 guide made agents a first-class topic. Know these five things and how they fit together.

| Piece | What it is | When the question means it |
|---|---|---|
| **AI agent** | A foundation model that plans steps, calls tools or APIs, observes results, and adapts to reach a goal | "Book, order, look up, then act" scenarios; multi-step tasks |
| **Model Context Protocol (MCP)** | An open standard for exposing tools and data sources to agents through one reusable interface | "Connect the agent to many internal systems without custom code per tool" |
| **Strands Agents** | Open-source, model-driven SDK: define model, tools, and prompt in a few lines of code | "Build an agent in code" |
| **Amazon Bedrock AgentCore** | Managed platform to deploy and operate agents: Runtime, Memory, Identity, Gateway, Policy, Observability, plus Code Interpreter and Browser tools | "Run agents in production securely without managing servers" |
| **Amazon Bedrock Agents** | The managed agent feature inside Bedrock: action groups (APIs, Lambda), knowledge bases, memory | "Managed agent with the least setup" |

Memory in agents is short-term (the current session's context) or long-term (facts and preferences persisted across sessions). Multi-agent systems typically use an orchestrator or supervisor that decomposes a goal and delegates to specialised agents. AgentCore Identity handles the agent's own identity and delegated access on a user's behalf; Policy in AgentCore authorises each tool call through AgentCore Gateway.

## Domain 3: Applications of foundation models (28%)

The largest domain. Nearly every question revolves around Bedrock. The table below answers roughly five exam questions on its own.

| Approach | Use it when | Cost and effort |
|---|---|---|
| **Prompt engineering** (in-context learning) | You need better output from the model as it is. Adds no new knowledge. *Try this first.* | Cheapest, fastest |
| **RAG** | The model needs fresh or private data (documents, databases), with citations. No retraining. → Bedrock Knowledge Bases | Low to medium |
| **Fine-tuning** (supervised or reinforcement) | You need a specific tone, format, or task behaviour, and have labelled examples or a reward signal | Higher; the custom model then runs on Provisioned Throughput or an on-demand custom-model deployment |
| **Distillation** | You want a smaller, cheaper, faster model that matches a large model's accuracy on your task | Medium; a teacher model generates training data for a student |
| **Continued pre-training** | You want the model to absorb a whole domain (legal, medical) from large amounts of unlabelled text | Most expensive |

### Concepts

- Model selection criteria: cost, modality, latency, multilingual support, model size and complexity, customisation, input and output length, **prompt caching**
- Effect of inference parameters on responses
- RAG pipeline: documents → chunking → embeddings → vector store → retrieve → augment prompt → generate
- Vector stores on AWS: Amazon OpenSearch Service (Serverless or managed), Amazon Aurora PostgreSQL with pgvector, Amazon Neptune Analytics (GraphRAG), Amazon RDS for PostgreSQL, Amazon S3 Vectors; Bedrock Knowledge Bases can quick-create OpenSearch Serverless, Aurora PostgreSQL Serverless, Neptune Analytics, or S3 Vectors
- The role of agents in multi-step tasks and their business applications
- Prompt engineering constructs (context, instruction, negative prompts) and techniques (chain-of-thought, zero-shot, single-shot, few-shot, templates); best practices (specificity, experimentation, guardrails); risks (exposure, poisoning, hijacking, jailbreaking)
- **Prompt versioning and management** with Bedrock Prompt Management
- Training elements: pre-training, fine-tuning, continued pre-training, distillation; fine-tuning methods: instruction tuning, domain adaptation, transfer learning; data preparation: curation, governance, size, labelling, representativeness, **RLHF**
- Evaluation: human-in-the-loop, benchmark datasets, Bedrock Model Evaluation; metrics ROUGE (summaries), BLEU (translation), BERTScore (semantic similarity), **LLM-as-a-judge**; evaluating RAG, agents, and workflows as applications; business alignment metrics: task completion rate, user satisfaction, cost per interaction
- Pricing: on-demand per token vs Provisioned Throughput (dedicated capacity for steady high volume) vs custom-model deployment

### Bedrock features to memorise

- **Knowledge Bases**: managed RAG; data from S3 and other connectors, automatic chunking, embedding, and vector storage
- **Agents**: task decomposition, action groups (APIs, Lambda), memory
- **Guardrails**: denied topics, content filters, sensitive-information (PII) filters, word filters, contextual grounding check; applied to input and output, across models
- **Model Evaluation**: automatic metrics, human evaluation, or LLM-as-a-judge
- **Prompt Management**: store, version, test, and reuse prompts
- **Custom models**: supervised fine-tuning, reinforcement fine-tuning, distillation, continued pre-training
- **Provisioned Throughput**: dedicated model units for predictable high-volume workloads; custom models can alternatively use on-demand custom-model deployment
- **Amazon Nova and Titan**: Amazon's own models; Titan Image Generator and Nova Canvas embed an invisible watermark in every generated image, and a detection API confirms it

## Domain 4: Guidelines for responsible AI (14%)

Mostly vocabulary: AWS's responsible-AI dimensions plus three or four services.

### Concepts

- Features of responsible AI: bias, fairness, inclusivity, robustness, safety, veracity; AWS's eight dimensions add explainability, privacy and security, controllability, governance, and transparency
- Bias types: sampling and selection, measurement, confirmation, algorithmic; class imbalance; effects of bias and variance on demographic groups, overfitting, and underfitting
- Dataset characteristics: inclusive, diverse, balanced, curated sources
- Tools to detect and monitor bias: label-quality analysis, human audits, subgroup analysis
- Interpretability vs explainability, and the trade-off with performance (a linear model vs a deep neural network); when to prefer the transparent model
- Responsible model selection, including environmental and sustainability considerations
- Human-in-the-loop and human oversight for high-stakes decisions; human-centred design: user feedback mechanisms, decision transparency
- Legal risks: intellectual property infringement, biased outputs, hallucinations, end-user risk, loss of customer trust
- Transparency artefacts: model cards, AI service cards, documented limitations, open-source models, data and licensing

### AWS services

- **SageMaker Clarify**: bias detection before and after training, plus explainability (SHAP)
- **SageMaker Model Cards**: model documentation; **AWS AI Service Cards** do the same for AWS's own services
- **Bedrock Guardrails**: toxicity, denied topics, PII; **Bedrock Model Evaluations** as a transparency tool
- **SageMaker Model Monitor**: drift and bias drift in production
- **Amazon Augmented AI (A2I)**: human review of low-confidence predictions; the canonical human-in-the-loop example, though it is not on the current in-scope list

> **Remember:** Trigger words — "detect bias" → Clarify. "Route low-confidence results to a human" → human review, A2I. "Document the model" → Model Cards. "Block harmful content" → Guardrails. "Explain a decision feature by feature" → Clarify (SHAP).

## Domain 5: Security, compliance, and governance for AI solutions (14%)

General AWS security applied to AI workloads. If you are new to AWS, give this an extra 20 minutes: IAM, KMS, and VPC will be unfamiliar.

### Concepts

- Shared responsibility model: AWS secures the cloud, you secure what you put in it (IAM, data, guardrails, application)
- IAM: users, roles, policies, least privilege; service roles (for example Bedrock reading from S3)
- Encryption at rest (KMS, customer-managed keys) and in transit (TLS)
- Private networking: VPC, interface endpoints with AWS PrivateLink to keep Bedrock traffic off the public internet
- Bedrock data facts: your content is *not* used to train base models, is *not* shared with model providers, and stays in your Region
- Source citation and data origins: data lineage and cataloguing (Glue Data Catalog, Lake Formation), Model Cards
- Secure data engineering: data quality, privacy-enhancing technologies, access control, integrity
- Security and privacy considerations: threat detection, vulnerability management, prompt injection, **data leakage prevention**, **output filtering and validation**, **audit trail and logging for AI interactions**, toxicity
- **Hallucination detection and grounding**: RAG grounding, output validation, confidence scoring; Guardrails' contextual grounding check
- **AgentCore Identity** and **Policy in AgentCore** for agent authentication and per-call authorisation
- Data governance: lifecycles, logging, residency, retention, monitoring
- Governance processes: policies, review cadence, the **Generative AI Security Scoping Matrix** (five scopes from consuming a public app to training your own model), transparency standards, team training
- Compliance frameworks: ISO, SOC, GDPR, HIPAA; algorithmic accountability laws

### AWS services

- **IAM**, **KMS**, **Secrets Manager**
- **CloudTrail** (who called which API, when), **Bedrock model invocation logging** (prompt and response content to S3 or CloudWatch Logs), **CloudWatch** (metrics and logs)
- **AWS Config** (resource compliance rules), **AWS Trusted Advisor** (best-practice checks), **AWS Well-Architected Tool**
- **Macie** (find PII in S3), **Inspector** (software vulnerabilities), **AWS Artifact** (download compliance reports)
- **Glue Data Catalog**, **Lake Formation** (data governance and permissions)
- **VPC endpoints / PrivateLink**
- **AWS Budgets**, **Cost Explorer** (cost governance)

> **Caution:** Amazon GuardDuty and AWS IAM Identity Center are explicitly *out of scope* in the 2026 guide, and AWS Audit Manager is not on the in-scope list. Older material lists all three under this domain.

## Services cheat sheet

Around 40% of the exam is "which service?". Read the trigger phrase, recall the service. Read this table twice on day 9 and twice on day 13.

| When the question says… | Service | In one line |
|---|---|---|
| Access foundation models via API, no infrastructure | **Amazon Bedrock** | Serverless FM access, pay per token |
| Chatbot over company documents (RAG) with least effort | **Bedrock Knowledge Bases** | Managed RAG from S3 and other sources |
| Multi-step tasks, call APIs, book or order things | **Bedrock Agents** / **AgentCore** | Orchestration plus action groups or tools |
| Run agents in production: runtime, memory, identity, tool gateway | **Amazon Bedrock AgentCore** | Managed agent platform |
| Build an agent in code with an open-source SDK | **Strands Agents** | Model-driven agent framework |
| Connect an agent to many tools through one standard | **Model Context Protocol (MCP)** | Open tool-integration standard |
| Block harmful content, deny topics, redact PII, check grounding | **Bedrock Guardrails** | Safety filters, model-agnostic |
| Version, test, and reuse prompts across teams | **Bedrock Prompt Management** | Prompt governance |
| Compare or score models, including LLM-as-a-judge | **Bedrock Model Evaluation** | Automatic, human, or judge-model evaluation |
| Smaller, cheaper model with a big model's accuracy | **Bedrock distillation** | Teacher trains student |
| Amazon's own text, image, and video models | **Amazon Nova** | Nova family in Bedrock |
| Enterprise assistant over employees' company data | **Amazon Q Business** | Permission-aware assistant |
| Agentic IDE that plans and writes code | **Kiro** | AWS's AI development environment |
| Ask natural-language questions of dashboards | **Amazon Quick** | BI, formerly QuickSight |
| Modernise mainframe or .NET workloads with agents | **AWS Transform** | Agentic migration |
| Build, train, deploy a custom ML model | **Amazon SageMaker AI** | Full ML platform |
| No-code ML for business analysts | **SageMaker Canvas** | Point-and-click models |
| Label training data with humans | **SageMaker Ground Truth** | Labelling workforce |
| Deploy an open-source FM with full control | **SageMaker JumpStart** | Pre-trained model hub |
| Detect bias, explain predictions | **SageMaker Clarify** | Bias metrics plus SHAP |
| Detect model or data drift in production | **SageMaker Model Monitor** | Continuous monitoring |
| Document a model for auditors | **SageMaker Model Cards** | Model documentation |
| Human review of low-confidence predictions | **Amazon A2I** | Human-in-the-loop workflows |
| Faces, objects, unsafe images in photos or video | **Rekognition** | Computer vision API |
| Extract text, tables, forms from scanned documents | **Textract** | OCR and more |
| Sentiment, entities, key phrases, PII in text | **Comprehend** | NLP API |
| Speech → text (call transcripts, subtitles) | **Transcribe** | Speech recognition |
| Text → lifelike speech | **Polly** | Text-to-speech |
| Translate between languages | **Translate** | Neural machine translation |
| Voice or text chatbot with intents and slots | **Lex** | The technology behind Alexa |
| Product recommendations like Amazon.com | **Personalize** | Real-time recommendations |
| Store embeddings for vector search | **OpenSearch Service**, **Aurora PostgreSQL**, **Neptune Analytics**, **S3 Vectors** | Vector stores for RAG |
| Find sensitive data (PII) in S3 | **Macie** | Data security |
| Who called which API, and when | **CloudTrail** | Audit log |
| Keep prompts and responses for review | **Bedrock model invocation logging** | To S3 or CloudWatch Logs |
| Download SOC or ISO compliance reports | **AWS Artifact** | Compliance documents |
| Check resource configuration against rules | **AWS Config** | Configuration compliance |
| Best-practice recommendations for the account | **Trusted Advisor** | Checks and recommendations |
| Find software vulnerabilities in workloads | **Amazon Inspector** | Vulnerability management |
| Keep Bedrock traffic off the public internet | **VPC endpoint (PrivateLink)** | Private connectivity |
| Encrypt data, manage keys | **KMS** | Key management |
| Decide which security controls a GenAI project needs | **Generative AI Security Scoping Matrix** | Five scopes |

## Glossary: the terms that appear again and again

| Term | Meaning |
|---|---|
| **Token** | A small piece of text (roughly four characters, three quarters of a word). Pricing and context limits are based on tokens. |
| **Context window** | How many tokens the model can see in one request, input plus output. |
| **Embedding** | A numeric vector for text or images; similar meaning → nearby vectors. The backbone of RAG. |
| **Vector database** | Stores embeddings and performs similarity search. |
| **Chunking** | Splitting large documents into smaller pieces before embedding. |
| **RAG** | Retrieval Augmented Generation: retrieve relevant data first, then insert it into the prompt before generating. |
| **Context engineering** | Choosing and structuring what enters the context window so the model sees what matters and nothing that misleads it. |
| **Hallucination** | The model states something false with confidence. Fixes: RAG grounding, guardrails, lower temperature, output validation, human review. |
| **Temperature** | The randomness knob. Near 0 is deterministic; higher is creative. |
| **Top-p / top-k** | Limit next-token candidates by probability mass (p) or count (k). |
| **Zero-shot / few-shot** | Prompting with no examples / with a few examples. |
| **Chain-of-thought** | Asking the model to reason step by step; improves accuracy on multi-step problems. |
| **Prompt injection** | User input that tries to override the model's instructions. Fixes: guardrails, input validation, least-privilege tools. |
| **Prompt caching** | Reusing the processed form of a repeated prompt prefix to cut cost and latency. |
| **Fine-tuning** | Adjusting model weights with labelled data (or a reward signal) for a specific task or style. |
| **Distillation** | Training a smaller student model to match a larger teacher model on a task. |
| **RLHF** | Reinforcement learning from human feedback: aligning a model to human preferences. |
| **Transfer learning** | Reusing a pre-trained model for a new, related task. |
| **Agentic AI** | Systems in which a model plans, uses tools, keeps memory, and acts toward a goal, often as several cooperating agents. |
| **MCP** | Model Context Protocol: an open standard that connects agents to tools and data sources. |
| **Overfitting** | Perfect on training data, poor on new data. Fixes: more data, regularisation, early stopping. |
| **Precision vs recall** | Precision: of everything flagged, how much was correct. Recall: of everything correct, how much was caught. Fraud and medical screening → recall matters more. |
| **ROUGE / BLEU / BERTScore** | Quality metrics for summarisation / translation / semantic similarity against a reference. |
| **LLM-as-a-judge** | Using a capable model to grade another model's outputs against a rubric, validated by human spot checks. |
| **Model drift** | Real-world data changes over time and accuracy drops. Model Monitor detects it. |
| **Explainability** | Why the model made a decision; required in regulated industries. SHAP via Clarify. |

## Study material

Few resources, fully used. One course, one question bank, and the free official material. Everything else is optional.

| Resource | Cost | Notes |
|---|---|---|
| **Stephane Maarek: Ultimate AWS Certified AI Practitioner** (Udemy), the main course | About USD 10–15 on sale | About 10 hours, exam-focused, beginner-friendly, quiz after each section. Udemy is almost always on sale; never pay full price. Confirm the version you buy covers the 2026 additions. [udemy.com/course/aws-ai-practitioner-certified](https://www.udemy.com/course/aws-ai-practitioner-certified/) |
| **OpsCanopy free AIF-C01 mock**, your day 8 baseline | Free | 65 original questions in the real domain weighting, every answer explained, written against exam guide v1.1. Use it timed on day 8 and again on day 12. [Take the mock](/tests/aws-ai-practitioner/) |
| **Tutorials Dojo (Jon Bonso): AIF-C01 Practice Exams**, the question bank | About USD 15 | Closest to real exam difficulty, with detailed explanations for every option. Those explanations *are* your revision. Timed mode and review mode. [portal.tutorialsdojo.com](https://portal.tutorialsdojo.com/product/aws-certified-ai-practitioner-aif-c01-practice-exams/) |
| **Official exam guide** (v1.1) | Free | Skim on day 1, re-read on day 13. It contains every task statement and the in-scope services list; this *is* the syllabus. [docs.aws.amazon.com exam guide](https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01.html) |
| **AWS Skill Builder: exam-prep plan and official practice question set** | Free (account required) | AWS's own prep course and 20 official practice questions. The best way to learn the question *style*. Do it on day 10 or 11. [skillbuilder.aws](https://skillbuilder.aws/) |
| **Andrew Brown / freeCodeCamp course** (YouTube), the free alternative to Maarek | Free | About 15 hours covering the full syllabus. Watch at 1.5× and skip hands-on demos if short on time. Search "AWS Certified AI Practitioner freeCodeCamp". |
| **PartyRock** | Free, no AWS account | A playground built on Bedrock. 20 minutes on day 4: build a tiny app, change temperature, change the prompt. Concepts click. [partyrock.aws](https://partyrock.aws/) |
| **Tutorials Dojo cheat sheets and AWS service FAQs** | Free | Service-by-service one-pagers for revision. Bedrock, SageMaker AI, and the Domain 5 security services are enough. [tutorialsdojo.com/aws-cheat-sheets](https://tutorialsdojo.com/aws-cheat-sheets/) |

**Total budget:** roughly USD 25–30 for course and practice tests, plus the exam fee of USD 100, or USD 50 with the `AIF2CLOUD` promotion before 30 September 2026.

## Exam day and question strategy

**Keywords decide the answer.** "Least operational overhead", "most cost-effective", "minimal ML expertise" → a managed service (Bedrock, Amazon Q, Rekognition). "Full control", "custom model" → SageMaker AI. "Needs current or private documents" → RAG. "Needs a consistent tone or format" → fine-tuning. "Must act, not just answer" → an agent.

**Eliminate first.** Two of the four options are almost always clearly wrong (wrong service, wrong domain). Remove them, then look for the trigger word in the remaining two.

**Time management.** 83 seconds per question. If you do not understand a question in 30 seconds, flag it and move on. Keep the last 15 minutes for flagged questions. Never leave a blank: unanswered questions score as incorrect and there is no penalty for guessing.

**Multiple response.** The question states how many to select. Choose exactly that many; there is no partial credit.

**Ordering and matching.** The FM lifecycle, the ML pipeline, and the RAG pipeline appear as ordering items. Memorise the sequences. Matching items pair services with use cases; the cheat sheet above is the preparation.

**If testing online.** Run the Pearson system test the day before. One screen only, clean desk, phone out of reach, no notes, government ID ready. AWS exams do not offer breaks; leaving the webcam view ends the exam.

**Understand the score.** 700 out of 1,000 is a scaled score and AWS does not publish a raw-percentage cutoff. Scoring 80% or more consistently in practice is safe. Results appear in your AWS Certification Account within five business days.

**Confidence.** This is a foundational exam. If you understand the concepts and service selection, you will pass. If in doubt, push the exam back three days, but do not over-prepare.

## Take the free 65-question mock

The [OpsCanopy AIF-C01 Full Mock Exam](/tests/aws-ai-practitioner/) has 65 original questions in the real domain weighting (13 / 16 / 18 / 9 / 9), with about a dozen on the 2026 additions: agentic AI, MCP, AgentCore, Kiro, Strands Agents, distillation, prompt caching, context engineering, LLM-as-a-judge, and the Generative AI Security Scoping Matrix. Every answer explains why each wrong option fails. Take it timed on day 8, read every explanation, and retake it on day 12 to measure the difference. If you prefer to read rather than click, the [answers-explained page](/tests/aws-ai-practitioner/aif-c01-full-mock-exam/review/) lays out all 65 questions as prose.

The runner uses multiple-choice and multiple-response items only; the real exam adds ordering and matching, whose content is covered here in multiple-choice form.

*Exam facts (65 questions, 90 minutes, USD 100, 700/1,000, domain weights, question types) are per AWS exam guide v1.1 dated 30 April 2026 and the AWS certification page as of September 2026. Promotion terms are per Pearson VUE's AIF2CLOUD page. Prices for third-party courses are approximate and change frequently.*
