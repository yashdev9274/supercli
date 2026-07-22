# 6. TRANSFORMERS, LLMs, AND FINE-TUNING — FOUNDATIONAL CONCEPTS

## Transformer Architecture Families
**Definition:** Three dominant architectural patterns based on the Transformer — encoder-only (understanding), decoder-only (generation), and encoder-decoder (sequence-to-sequence). The architectural choice determines what tasks the model excels at and how it processes input.

### Theory & Explanation

The original Transformer paper introduced an encoder-decoder architecture for machine translation. Since then, the field has split into three specialized families, each optimized for different task categories. Understanding these architectural differences is essential because they determine how a model processes context, generates output, and handles bidirectional information.

**Encoder-only models** (BERT, RoBERTa, DistilBERT, ALBERT) use bidirectional self-attention in every layer — each token can attend to all other tokens on both sides. This enables deep understanding of context: the representation of "bank" in "river bank" vs "money bank" is informed by words on both sides. Encoder-only models are pretrained with masked language modeling (MLM): random tokens are masked (replaced with [MASK]), and the model predicts them using full bidirectional context. These models excel at understanding tasks — classification, NER, sentiment analysis, question answering, sentence pair classification — but cannot generate text naturally (they produce fixed-size vector representations, not token sequences).

**Decoder-only models** (GPT series, LLaMA, Mistral, Claude, Gemini) use causal (masked) self-attention — each token can only attend to tokens before it, not after. This ensures autoregressive generation: when predicting the next token, the model cannot peek at future tokens. Decoder-only models are pretrained with next-token prediction (causal language modeling): given a sequence, predict the next token. The causal mask (upper triangular matrix of -inf) is applied to attention scores: position i can attend to positions 0 through i, not beyond. This family dominates modern LLMs because (1) scaling laws favor decoder-only for generative tasks, (2) they naturally support in-context learning and few-shot prompting, and (3) they are simpler to train at scale (no separate encoder).

**Encoder-decoder models** (T5, BART, MarianMT) have separate encoder (bidirectional attention) and decoder (causal attention). The encoder processes the full input bidirectionally, producing a sequence of hidden states. The decoder generates output autoregressively, attending to both the decoder's previous tokens (via causal self-attention) and the encoder's hidden states (via cross-attention). The cross-attention mechanism uses decoder queries and encoder key-value pairs. These models are ideal for sequence-to-sequence tasks: translation, summarization, text rewriting, and any task where input understanding depth matters and output is generated. T5 unified all NLP tasks into a text-to-text format: "translate English to German: The house is blue" → "Das Haus ist blau".

### Example

| Feature | Encoder-only (BERT) | Decoder-only (GPT) | Encoder-Decoder (T5) |
|---------|-------------------|-------------------|---------------------|
| Attention | Bidirectional | Causal (left-to-right) | Bidirectional encoder, causal decoder |
| Pretraining | Masked LM (MLM) | Next-token prediction | Span corruption |
| Best for | Classification, NER, QA, sentence pairs | Text generation, chat, code, in-context learning | Translation, summarization, seq2seq |
| Generation | Not native | Autoregressive (any length) | Autoregressive decoder |
| Example size | 110M (BERT-base) to 340M (BERT-large) | 125M (GPT-2) to 1.7T (GPT-4 estimated) | 220M (T5-base) to 11B (T5-XXL) |
| Representative models | BERT, RoBERTa, ELECTRA, DeBERTa | GPT-4, LLaMA 3, Mistral, Claude | T5, BART, mT5, MarianMT |

### Interview Questions

**Q: When would you choose an encoder-only model over a decoder-only model?**
A: Encoder-only models are preferred when the task is understanding-based rather than generative — text classification, named entity recognition, sentiment analysis, question answering, and sentence similarity. The bidirectionality provides richer context representations, and these models are typically smaller, faster, and more data-efficient for these tasks. Decoder-only models are preferred for generation tasks, conversational AI, code generation, and any task where few-shot in-context learning is valuable. For a production NER system, BERT-based models often outperform GPT-4 on accuracy and cost while running in milliseconds vs seconds.

**Q: What is cross-attention and why does encoder-decoder use it?**
A: Cross-attention is the mechanism in the decoder that attends to the encoder's output. The decoder's queries come from its current hidden state, while the keys and values come from the encoder's final hidden states. This allows the decoder to access the full input context at every generation step. For translation, when generating the third word of the output, the decoder can look back at any part of the input sentence via cross-attention. Encoder-decoder architectures need this because the encoder provides thorough input understanding while the decoder focuses on fluent generation. Pure decoder-only models lack this separation — they must store all input information in the same attention layers used for generation, which can be less efficient for long inputs.

### Related Concepts
Transformers, Self-Attention, BERT, GPT, Pretraining Objectives

---

## LLM Training Pipeline
**Definition:** The three-stage process for building a production-ready LLM: unsupervised pre-training on internet-scale text (knowledge acquisition), supervised fine-tuning on instruction-output pairs (behavior alignment), and preference optimization (value alignment).

### Theory & Explanation

Modern LLMs are not simply trained once — they go through a carefully designed multi-stage pipeline. Each stage serves a fundamentally different purpose and requires different data, compute, and techniques.

**Stage 1: Pre-training.** The model is trained on trillions of tokens from the internet — web pages, books, academic papers, code repositories. The objective is next-token prediction: given all previous tokens, predict the next one. This single objective, applied at enormous scale, forces the model to learn grammar, factual knowledge, reasoning patterns, translation, code syntax, and world modeling. Pre-training is computationally massive — estimated $50-200M for frontier models. No labeled data is needed; the text itself provides the labels. The output is a base model that can complete text but does not follow instructions or answer questions helpfully. Key considerations: data quality filtering, deduplication (MinHash), PII removal, and legal filtering. The Chinchilla scaling law governs optimal allocation of compute between model size and training tokens.

**Stage 2: Supervised Fine-Tuning (SFT).** The base model can generate text but does not follow instructions — it might complete a prompt rather than answer it. SFT trains the model on curated (instruction, response) pairs collected from humans or high-quality sources. For example: Instruction: "Explain what a transformer is in one sentence." Response: "A transformer is a neural network architecture that processes all tokens in parallel using self-attention, enabling efficient learning of long-range dependencies." The model continues next-token prediction training, but now on instruction-response data instead of raw internet text. After SFT, the model learns the pattern of following instructions, answering questions helpfully, and formatting responses appropriately. SFT typically uses 10K-100K examples and runs for 1-3 epochs. Quality matters far more than quantity — a small set of carefully written examples outperforms large noisy datasets.

**Stage 3: Preference Optimization.** SFT teaches the model to follow instructions, but does not teach it to prefer good responses over bad ones. Preference optimization aligns the model with human values: helpfulness, honesty, safety. The two main approaches are RLHF (Reinforcement Learning from Human Feedback) and DPO (Direct Preference Optimization). RLHF trains a separate reward model on human preference judgments (response A is better than response B), then uses PPO to optimize the LLM against this reward model. DPO directly optimizes the LLM on preference pairs without a separate reward model, which is simpler and more stable. Either way, the model learns to rank responses and prefer the ones humans find most helpful and least harmful.

Many models also include an additional **alignment fine-tuning** stage using techniques like constitutional AI (self-critique and revision based on written principles) or red teaming (adversarial testing to find and fix failure modes). The final model after all stages is what users interact with through chat interfaces and APIs.

### Example

Training LLaMA 3 70B: Pre-training on 15 trillion tokens from the internet — 90% web pages (CommonCrawl, filtered), 5% books, 3% academic papers, 2% code. This took approximately 6.4M GPU hours on H100s. SFT used 25,000 high-quality instruction-response pairs written by contractors and in-house experts, covering diverse tasks: writing, analysis, coding, math, creative. DPO used 100,000 preference pairs (response A vs response B) from human raters. The final model demonstrates instruction following, refuses harmful requests, and produces helpful responses. Without any single stage: pre-training only gives a text completer, SFT only cannot teach new knowledge, preference optimization only cannot teach general capability.

### Interview Questions

**Q: Why can't we just train a model end-to-end on instruction data instead of pre-training first?**
A: Two fundamental reasons. First, instruction data is scarce and expensive — generating 100K high-quality instruction-response pairs costs hundreds of thousands of dollars. Pre-training data is free (the internet provides trillions of tokens). The model needs to learn general knowledge, language, and reasoning from abundant unlabeled data before it can meaningfully follow instructions. Second, pre-training teaches the model what the world is like — facts, relationships, patterns. Instruction tuning teaches the model how to behave. A model trained only on instruction data would have extremely limited knowledge (hundreds of examples cannot cover the breadth of human knowledge) and would not generalize to unseen topics.

**Q: What is the difference between SFT and RLHF/DPO?**
A: SFT (Supervised Fine-Tuning) teaches the model the format and style of good responses — it learns to follow instructions and produce plausible answers. However, SFT cannot teach the model to prefer one good response over another because it only sees positive examples. If a model produces a somewhat incorrect response, SFT cannot correct it because there is no negative signal. RLHF and DPO provide this signal by training on comparisons: response A is better than response B. This teaches the model to rank responses and avoid harmful or low-quality outputs. SFT is like teaching someone to write sentences; preference optimization teaches them to distinguish good writing from bad writing and prefer the good.

### Related Concepts
Pre-training, Fine-tuning, RLHF, Scaling Laws

---

## Base Model vs Instruct/Chat Model
**Definition:** A base model is a raw pre-trained LLM that completes text. An instruct/chat model is the same model after SFT and preference optimization — it follows instructions, answers questions, and refuses harmful requests.

### Theory & Explanation

When a company releases an LLM, they typically release two variants: the base model and the instruct/chat version. These are the same underlying neural network architecture and weights, but the instruct version has undergone additional training stages that dramatically change its behavior.

A **base model** (e.g., LLaMA 3 70B Base, Mistral 7B Base, GPT-3 Base) is the raw pre-trained model. Its only training signal was next-token prediction on internet text. This means:
- Given "The capital of France is", it completes with "Paris" (factual knowledge from pre-training).
- Given "What is the capital of France?", it might respond "What is the capital of France? The capital of France is Paris." (it mirrors the question because internet text contains many Q&A pairs).
- Given "Write a poem about AI", it might respond "I'm sorry, I cannot write a poem about AI. Here is a poem about AI:" (mixed signals from pre-training data).
- It has no concept of refusing harmful requests — given "How to make a bomb:", it will complete the text.
- It does not follow a consistent format or conversation structure.

An **instruct/chat model** (e.g., LLaMA 3 70B Instruct, Mistral 7B Instruct, GPT-3.5 Turbo) takes the base model and applies SFT + preference optimization. This changes:
- It understands that questions should be answered directly: "What is the capital of France?" → "The capital of France is Paris."
- It follows a chat template format with system, user, and assistant roles.
- It can refuse harmful requests: "How to make a bomb?" → "I cannot provide instructions for creating harmful substances."
- It maintains consistent formatting, tone, and helpfulness.
- It can follow complex multi-turn conversations with context from previous turns.

The chat template is critical for proper behavior. It structures the conversation into roles. A typical prompt using the LLaMA 3 chat template:
```
<|begin_of_text|><|start_header_id|>system<|end_header_id|>
You are a helpful assistant.
<|eot_id|><|start_header_id|>user<|end_header_id|>
What is the capital of France?<|eot_id|><|start_header_id|>assistant<|end_header_id|>
```

Without the correct template, an instruct model behaves like a base model — it does not know when to switch between user and assistant roles. Different models use different chat templates: LLaMA 3 uses special tokens (<|start_header_id|>), Mistral uses [INST] and [/INST] tags, OpenAI uses separate API fields for system/user/assistant messages. The template is applied by the inference framework, not written by the user.

### Example

Same base model, same prompt, different behavior:

Prompt: "Explain quantum computing in simple terms."

Base model response: "explain quantum computing in simple terms Quantum computing is a type of computing that uses quantum bits or qubits to perform calculations. Quantum bits can exist in multiple states simultaneously, a property known as superposition. Here is some more information about quantum computing:"

Instruct model response: "Quantum computing is a new approach to computation that uses quantum bits (qubits) instead of regular bits. While regular bits can only be 0 or 1, qubits can be both 0 and 1 at the same time thanks to superposition. This allows quantum computers to explore many possible solutions simultaneously, making them potentially much faster for certain problems like factoring large numbers or simulating molecules."

The base model mirrors the prompt and rambles; the instruct model gives a clear, well-structured explanation.

### Interview Questions

**Q: Can you use a base model for a chatbot application without instruction tuning?**
A: Technically yes, but the results are poor. A base model does not understand the concept of a conversation — it may repeat the user's question, generate both sides of a dialogue, or fail to answer altogether. You can partially compensate with careful prompting (e.g., "User: ...\nAssistant: ..."), but the model has never been trained to consistently play the assistant role. The base model may also refuse harmful requests inconsistently or not at all, creating safety issues. In practice, always use an instruct/chat model for conversational applications. If you need to fine-tune for a specific domain, start from a base model and apply your own SFT/preference optimization pipeline.

**Q: What happens if you use the wrong chat template for a model?**
A: The model may exhibit degraded behavior: ignoring user instructions, mixing up roles, producing incoherent responses, or failing to follow the conversation format. Each model family uses specific tokens for role delineation — LLaMA 3 uses special header tokens, Mistral uses INST tags, Phi uses <|user|> and <|assistant|>. If you apply the LLaMA template to a Mistral model, Mistral will not recognize the special tokens and will treat them as regular text, breaking the role structure. Correct template matching is critical — inference frameworks like vLLM, TGI, and llama.cpp handle this automatically when you specify the model name.

### Related Concepts
SFT, RLHF, Prompt Engineering, Chat Templates

---

## Prompt Templates & Chat Formats
**Definition:** Structured formats that define roles (system, user, assistant) in a conversation with an LLM. The template is applied by the inference framework to transform messages into a single token sequence the model understands.

### Theory & Explanation

LLMs that support multi-turn conversations need a way to distinguish who is speaking — system instructions, user input, and assistant responses. Different model families use different special tokens and formats to encode this structure. The chat template is a Jinja2 template stored in the model's tokenizer configuration (tokenizer_config.json) that converts a list of message objects into a formatted string.

**Common chat formats:**

| Format | Example Model | Structure |
|--------|--------------|-----------|
| **ChatML** | GPT-4, many open models | <|im_start|>system\n...<|im_end|>\n<|im_start|>user\n...<|im_end|>\n<|im_start|>assistant\n...<|im_end|> |
| **LLaMA 3** | LLaMA 3, 3.1 | <|start_header_id|>system<|end_header_id|>\n...<|eot_id|><|start_header_id|>user<|end_header_id|>\n...<|eot_id|><|start_header_id|>assistant<|end_header_id|> |
| **Mistral** | Mistral, Mixtral | [INST] ... [/INST] for user, no special tags for assistant |
| **Alpaca** | Alpaca, Vicuna | "Below is an instruction...\n\n### Instruction:\n...\n\n### Response:\n" |
| **Phi** | Phi-3, Phi-4 | <|user|>\n...<|end|>\n<|assistant|>\n...<|end|> |
| **Gemma** | Gemma 2 | <bos><start_of_turn>user\n...<end_of_turn>\n<start_of_turn>model\n...<end_of_turn> |

The **system prompt** sets the model's behavior, persona, constraints, and knowledge scope. It is typically applied once at the start of a conversation and persists across all turns. Common system prompts include: "You are a helpful assistant.", "You are an expert data scientist.", "Answer only based on the provided context."

The **user role** contains the actual request — question, instruction, task description. The **assistant role** is where the model generates its response. In multi-turn conversations, previous assistant responses are fed back as input so the model maintains context. The template ensures the model knows which turns are its own output and which are user input.

### Example

Using the ChatML format for a two-turn conversation:

```
<|im_start|>system
You are a helpful data science tutor.<|im_end|>
<|im_start|>user
What is overfitting?<|im_end|>
<|im_start|>assistant
Overfitting is when a model learns the training data too well, including noise, and fails to generalize to new data.<|im_end|>
<|im_start|>user
How can I prevent it?<|im_end|>
<|im_start|>assistant
Techniques include cross-validation, regularization (L1/L2), pruning, dropout, early stopping, and more training data.<|im_end|>
```

The model sees this exact token sequence. The special tokens (<|im_start|>, <|im_end|>) tell it where each message boundary is and which role is speaking. The assistant tokens are critical — the model learns during SFT that after <|im_start|>assistant, it should generate a helpful response and then stop at <|im_end|>.

### Interview Questions

**Q: What is the purpose of the system prompt?**
A: The system prompt sets the model's behavior for the entire conversation — role, tone, constraints, rules, and knowledge scope. It is applied once and persists across all turns. Effective system prompts reduce the need to repeat instructions in every user message. They can also enforce safety: "Do not provide medical advice," "Refuse inappropriate requests," "Only answer based on the provided context." The system message is typically included at the start of the chat template, before any user messages. Not all models handle system prompts equally — some treat them as less authoritative than user messages.

**Q: Why do different LLMs need different chat templates?**
A: Each model family was trained with specific special tokens for role demarcation. LLaMA 3 was trained with <|start_header_id|> and <|eot_id|> tokens; using ChatML's <|im_start|> tokens would be meaningless to LLaMA 3 because those tokens were never in its training data. The model learned during SFT that "after <|start_header_id|>assistant<|end_header_id|>, generate a response." Without this exact token sequence, the model does not know what to do. Inference frameworks store the correct template in the model's tokenizer_config.json and apply it automatically. Manually constructing the wrong template is a common source of poor model performance.

### Related Concepts
Base vs Instruct Model, SFT, Prompt Engineering, Tokenization

---

## When to Fine-tune vs RAG vs Prompt Engineering
**Definition:** A decision framework for choosing between three LLM adaptation strategies based on the nature of the task, data, knowledge requirements, and operational constraints.

### Theory & Explanation

Organizations building on LLMs face a fundamental choice: how to adapt the model for their specific use case. The three primary strategies — prompt engineering, RAG, and fine-tuning — serve different purposes and have different cost, complexity, and maintenance profiles. Most production systems use a combination, but understanding the distinct use cases for each is critical.

**Prompt engineering** is the simplest and fastest method. It involves crafting system prompts, user prompts, and few-shot examples to guide the model's behavior. It requires no training, no infrastructure beyond the LLM API, and changes are instantaneous. Use prompt engineering when: (1) the desired behavior can be described in text, (2) the task does not require access to new or proprietary knowledge, (3) you need to iterate quickly, (4) the task is simple enough that the model already knows how to do it but needs guidance on format and style. Limitations: prompts consume context window tokens, complex behaviors are hard to specify, consistency across multiple prompts is difficult, and the model may ignore instructions for subtle edge cases.

**RAG (Retrieval-Augmented Generation)** connects the LLM to an external knowledge base at inference time. Retrieved documents are injected into the prompt as context. Use RAG when: (1) the model needs access to information beyond its training cutoff or proprietary knowledge (company policies, product documentation, recent news), (2) the knowledge base changes frequently and retraining is impractical, (3) source attribution and citation are required for compliance or trust, (4) hallucination reduction is critical. RAG advantages: knowledge can be updated instantly by adding new documents, no model retraining needed, citations provide transparency. Limitations: retrieval quality is critical and failure-prone, latency increases due to retrieval, context window management is challenging for large knowledge bases, and the LLM may still ignore retrieved context.

**Fine-tuning** modifies the model's weights through additional training on task-specific data. Use fine-tuning when: (1) the task requires a specific output format, style, or behavior that prompting cannot reliably produce (e.g., legal document generation, structured JSON extraction), (2) the model needs to learn domain-specific terminology or reasoning patterns (medical diagnosis, code for a proprietary API), (3) you need to reduce latency/cost by using a smaller model that has been specialized to match a larger model's performance, (4) consistent behavior across millions of requests is required (prompt engineering has variance). Limitations: requires curated training data, expensive (especially full fine-tuning), risk of catastrophic forgetting, and knowledge learned during fine-tuning cannot be easily updated.

### Example

| Scenario | Best Approach | Why |
|----------|--------------|-----|
| Customer support chatbot using company policy docs | RAG | Policies change frequently, citations needed, no retraining on every policy update |
| Generate legal contracts in a specific format | Fine-tuning | Format requirements are strict, prompting alone produces inconsistent output |
| Summarize news articles in 3 bullet points | Prompt engineering | The model already knows how to summarize, just needs format guidance |
| Code assistant for an internal framework | Fine-tuning + RAG | Fine-tune on framework syntax, RAG for current API docs |
| Classify customer emails into 10 categories | Prompt engineering | Simple classification, few-shot examples work reliably |
| Medical diagnosis assistant with latest research | RAG | Knowledge cutoff is critical, citations mandatory for trust |

### Interview Questions

**Q: Why not just fine-tune for everything?**
A: Fine-tuning has significant downsides for knowledge-dependent tasks. (1) Knowledge learned during fine-tuning is static — if you fine-tune a model on company policies, every policy change requires re-fine-tuning. RAG updates knowledge instantly by swapping documents. (2) Fine-tuning risks catastrophic forgetting — the model may lose general capabilities as it specializes. (3) Fine-tuning is expensive — even LoRA requires GPU hours, data curation, and evaluation. (4) Fine-tuning does not provide citations or source attribution — you cannot tell if the model is using the fine-tuned knowledge or hallucinating. For most practical applications, the best approach is RAG for knowledge access with prompt engineering for format, reserving fine-tuning only for behavioral changes that cannot be achieved through prompting.

**Q: Can you combine all three approaches?**
A: Yes — this is the most common pattern in production. Start with prompt engineering for basic behavior and format. Add RAG for knowledge access. Only add fine-tuning for specific behavioral requirements that prompting cannot reliably achieve. Example: A customer support system uses prompt engineering to set the assistant persona and tone, RAG to retrieve relevant policy documents, and fine-tuning on a small model (e.g., fine-tuned LLaMA 3 8B) to match the response quality of a larger model (GPT-4) at lower cost and latency. The three approaches are complementary, not competing.

### Related Concepts
RAG, Fine-tuning, Prompt Engineering, Transfer Learning

---

## Instruction Tuning
**Definition:** Training a pre-trained language model on curated (instruction, response) pairs to teach it to follow human instructions, answer questions helpfully, and produce structured responses.

### Theory & Explanation

Instruction tuning is the second stage of the LLM training pipeline. A pre-trained base model knows how to complete text but does not understand that a question should be answered directly — it might mirror the question instead of answering it. Instruction tuning bridges this gap by training on thousands of examples showing the desired input-output pattern.

**Dataset format.** Each example in an instruction tuning dataset is a pair: the instruction (what the user asks or tells the model) and the response (how the model should respond). Instructions can be questions, tasks, creative prompts, or commands. Responses can be answers, code, formatted text, explanations, or refusals. The dataset may also include input context alongside the instruction — for example, a document to summarize plus the instruction "Summarize the following text." A typical instruction tuning example:

```
Instruction: "Explain the difference between supervised and unsupervised learning."
Input: (empty or optional context)
Response: "Supervised learning trains on labeled data where input-output pairs are provided... Unsupervised learning finds patterns in unlabeled data..."
```

**Dataset diversity is critical.** A good instruction tuning dataset covers a wide range of task types: writing, analysis, summarization, translation, coding, math, reasoning, creative writing, classification, extraction, and refusal (saying no to harmful requests). It also varies in response length (single word to multi-paragraph), complexity, and domain. The FLAN dataset (Google, 2022) showed that aggregating instructions from 60+ task categories dramatically improves generalization to unseen tasks. The key insight: instruction diversity matters more than the number of examples — a model trained on 10K diverse examples often outperforms one trained on 100K repetitive examples.

**Multi-turn instruction tuning** extends beyond single-turn to conversations. Each example includes a sequence of user-assistant turns, teaching the model to maintain context across multiple exchanges. This is critical for chatbot applications. The dataset includes turns where the assistant asks clarifying questions, refers back to earlier statements, and remembers user preferences.

**Quality guidelines for instruction tuning data:**
- Responses must be correct and factual (verified by experts for high-stakes domains)
- Responses should be appropriately detailed — not overly verbose for simple questions, not too brief for complex ones
- Instructions should be diverse in phrasing and specificity
- The dataset should include edge cases: ambiguous instructions, multi-part questions, and requests that should be refused
- Responses should follow consistent formatting (markdown, bullet points, code blocks as appropriate)

### Example

Instruction tuning dataset samples:

| # | Instruction | Input | Response |
|---|------------|-------|----------|
| 1 | "Translate this to French:" | "Hello, how are you?" | "Bonjour, comment allez-vous ?" |
| 2 | "Write a Python function to check if a string is a palindrome." | (empty) | "def is_palindrome(s):\n    return s == s[::-1]" |
| 3 | "Summarize this article in 2-3 sentences." | "[Article text...]" | "[2-3 sentence summary...]" |
| 4 | "What is 15 × 37?" | (empty) | "15 × 37 = 555" |
| 5 | "Tell me how to pick a lock." | (empty) | "I cannot provide instructions for illegal activities. If you are locked out of your property, please contact a licensed locksmith." |

Example 5 is critical — it teaches the model to refuse harmful requests gracefully, providing a helpful alternative rather than simply saying "I can't answer that."

### Interview Questions

**Q: Why does instruction diversity matter more than dataset size?**
A: A model trained on 100K similar instruction-response pairs (all about writing emails) learns only one narrow skill. A model trained on 10K diverse examples (writing, coding, math, translation, reasoning, refusal) learns the general pattern of following instructions across domains. During SFT, the model is not just learning specific facts — it is learning the meta-skill of instruction following. Diverse examples teach it that instructions come in many forms and the model should try to fulfill the user's intent regardless of the domain. The FLAN paper demonstrated this empirically: adding more task categories improved performance on held-out tasks far more than adding more examples of the same tasks.

**Q: How do you handle harmful or toxic instruction-response pairs in your dataset?**
A: Two strategies. First, include explicit refusal examples: instructions that should be refused (illegal activities, hate speech, medical advice) paired with polite refusals. This teaches the model boundaries. Second, filter the dataset: remove any example where the instruction is harmful or the response contains toxic content. Some amount of edge case data (showing how to refuse convincingly) is valuable, but the majority of the dataset should be positive, helpful interactions. A good rule is approximately 5-10% refusal examples. Additionally, red teaming after SFT helps identify remaining failure modes that can be patched with targeted examples.

### Related Concepts
SFT, RLHF, Base vs Instruct Model, Chat Templates

---

## Fine-tuning Methods: Full Fine-tuning vs PEFT
**Definition:** Full fine-tuning updates all model parameters on task data. Parameter-Efficient Fine-Tuning (PEFT) updates only a small subset of parameters (typically <1%) via injected adapters, achieving comparable performance with dramatically lower compute and memory.

### Theory & Explanation

Fine-tuning adapts a pre-trained model to a specific task or domain by continuing training on task-specific data. The fundamental choice is whether to update all parameters or only a small subset.

**Full fine-tuning** loads the pre-trained weights and continues training on the target dataset using a low learning rate (typically 1e-5 to 5e-5, compared to 1e-3 to 1e-2 for training from scratch). All model parameters are updated. Advantages: maximum expressiveness — the model can fully adapt to the target domain. Disadvantages: extremely expensive — fine-tuning a 70B model requires 8-16 GPUs with 80GB each, taking days to weeks. Full fine-tuning also produces a separate copy of the model for each task, making it impractical for serving multiple fine-tuned variants.

**LoRA (Low-Rank Adaptation)** is the most popular PEFT method. It injects trainable low-rank matrices into the attention layers while keeping the original weights frozen. For a weight matrix W of dimension d × k, LoRA learns two smaller matrices A (d × r) and B (r × k) where r is the rank (typically 4-64). The forward pass becomes: h = Wx + BAx. The original W is frozen; only A and B are updated during training. This means LoRA adds only r(d + k) trainable parameters per layer instead of dk. For a 7B model, full fine-tuning updates 7B parameters; LoRA (r=16) updates approximately 20-50M parameters — a 99.7% reduction. LoRA adapters are tiny files (a few MB) that can be swapped at inference time without reloading the model.

**QLoRA** combines LoRA with 4-bit quantization of the base model. The pre-trained weights are quantized to 4-bit NormalFloat format, reducing memory by 4x (e.g., 70B model from 140GB to 35GB). LoRA adapters are trained in full precision (BF16/FP16) on top of the quantized base. Gradients are computed by dequantizing to BF16 only for the specific weights involved in the current forward/backward pass. QLoRA enables fine-tuning 70B models on a single 48GB GPU — previously impossible even for inference. The quantized model retains approximately 99-99.9% of the original quality.

**Other PEFT methods:**
- **Adapters** insert small bottleneck layers between Transformer sub-layers.
- **Prefix Tuning** prepends learnable virtual tokens to the input (or to each layer's key/value).
- **Prompt Tuning** adds learnable soft prompt tokens only to the input embedding layer.
- **P-Tuning v2** adds learnable prompt embeddings to each Transformer layer.
- **IA³** learns scaling vectors for keys, values, and feedforward activations.

**Compare PEFT methods:**

| Method | Trainable params | Memory (7B model) | Performance vs Full FT | When to use |
|--------|-----------------|-------------------|----------------------|-------------|
| Full FT | 7B | ~60 GB (BF16) | Baseline | Maximum performance, unlimited compute |
| LoRA (r=16) | ~33M | ~18 GB | 95-99% | Most tasks, good balance |
| QLoRA (r=16) | ~33M | ~10 GB | 93-98% | Limited GPU memory |
| Adapters | ~40M | ~20 GB | 94-98% | When layer-specific adapters needed |
| Prefix Tuning | ~2M | ~16 GB | 85-95% | Very low memory, generative tasks |

### Example

Fine-tuning LLaMA 3 8B for medical Q&A. Full fine-tuning: requires 4× A100 (80GB) GPUs, 3 days, outputs a 16GB model file. LoRA (r=16): requires 1× A100 (80GB) or 2× RTX 4090 (24GB), 6 hours, outputs a 16MB adapter file. QLoRA: requires 1× RTX 4090 (24GB), 8 hours, outputs a 16MB adapter file. Performance: full FT achieves 87% accuracy on the medical benchmark, LoRA achieves 86%, QLoRA achieves 85.5%. The 1-2% accuracy gap is often acceptable given the 10x+ reduction in compute cost. Multiple QLoRA adapters can be swapped without reloading the base model, enabling a single serving instance to handle multiple fine-tuned variants.

### Interview Questions

**Q: How does LoRA reduce the number of trainable parameters while maintaining performance?**
A: LoRA is based on the insight that learned over-parameterized models have a low intrinsic rank — the weight updates during fine-tuning lie in a low-dimensional subspace. Instead of updating the full d×k weight matrix (millions of parameters), LoRA learns two low-rank matrices A (d×r) and B (r×k) where r is much smaller than min(d, k). The effective update is ΔW = BA. Since r is 4-64 while d and k are 4096-8192, this represents a 99%+ reduction. During training, only A and B receive gradients. At inference, the trained BA product can be merged into W (W_merged = W + α·BA) with zero additional latency, or kept separate for quick swapping.

**Q: What are the trade-offs between full fine-tuning and LoRA?**
A: Full fine-tuning can achieve slightly higher task accuracy (1-5% depending on task) because it can update all parameters and adapt completely to the target domain. However, it requires 4-8x more GPU memory, 3-10x more training time, produces a full model copy per task (impractical for multi-task serving), and risks catastrophic forgetting. LoRA matches full fine-tuning on most tasks within 1-2% accuracy, uses dramatically less memory, trains faster, produces tiny adapter files, enables quick task switching without reloading the base model, and has built-in regularization (low-rank constraint reduces overfitting). For most practical applications, LoRA or QLoRA is preferred unless maximum accuracy is critical and compute is abundant.

### Related Concepts
Fine-tuning, QLoRA, Transfer Learning, Quantization

---

## Loss Functions & Training Considerations
**Definition:** The cross-entropy loss over next-token prediction is the standard objective for LLM fine-tuning. Key training considerations include learning rate, batch size, gradient accumulation, overfitting prevention, and evaluation.

### Theory & Explanation

**Loss function.** LLM fine-tuning uses the same loss as pre-training: cross-entropy over next-token prediction. For each position in the sequence, the model predicts a probability distribution over the vocabulary, and the loss is the negative log probability of the correct token. The total loss is the average across all positions. During fine-tuning, we may mask certain tokens from the loss computation — typically only the response tokens contribute to the loss, while instruction tokens are masked. This ensures the model only learns to generate good responses, not to predict the instruction.

```
Loss = -(1/N) Σ log p(y_t | y_<t, x)
```

Where x is the instruction (input), y_<t are previous response tokens, and y_t is the correct next token. N is the number of response tokens. The loss is computed only over response positions, not instruction positions.

**Learning rate.** Fine-tuning uses a much lower learning rate than pre-training because the model already has good weights — we want gentle adaptation, not drastic changes. Typical ranges: full fine-tuning 1e-5 to 5e-5, LoRA 1e-4 to 5e-4 (the lower rank means larger updates are needed to achieve similar movement in the full weight space). A cosine or linear decay schedule with a short warmup (50-200 steps) is standard.

**Batch size and gradient accumulation.** Effective batch size = (per-device batch size) × (number of devices) × (gradient accumulation steps). For fine-tuning, effective batch sizes of 16-128 are typical. Gradient accumulation simulates larger batches by accumulating gradients over multiple forward/backward passes before doing one optimizer step. This allows training with larger effective batch sizes than GPU memory would normally permit. For example, with a per-GPU batch size of 2, 4 GPUs, and gradient accumulation steps of 8, the effective batch size is 2 × 4 × 8 = 64.

**Overfitting prevention in fine-tuning:**
- **Early stopping:** monitor validation loss and stop when it stops improving. Fine-tuning often needs only 1-3 epochs; more can lead to overfitting.
- **Weight decay:** adds a penalty for large weights (L2 regularization). Typical values: 0.01 to 0.1.
- **Dropout:** dropout layers in the model (typically 0.1) are usually kept active during fine-tuning.
- **LoRA rank as regularization:** lower rank (r=4-16) imposes a stronger low-rank constraint, reducing overfitting on small datasets.
- **Dataset size:** more diverse data reduces overfitting risk. Fine-tuning on 1K examples requires more careful regularization than 100K examples.

**Evaluation during fine-tuning.** The model should be evaluated on a held-out validation set after each epoch or at regular intervals. Metrics depend on the task: accuracy for classification, BLEU/ROUGE for generation, exact match for QA, human preference ratings for open-ended tasks. Perplexity on the validation set provides a general quality signal but does not always correlate with task performance — a model can have low perplexity (fluent text) while being factually wrong.

### Example

Fine-tuning LLaMA 3 8B on a medical Q&A dataset of 10K examples:
- Loss: cross-entropy over response tokens only (instruction tokens masked)
- Learning rate: 2e-4 (LoRA r=16), cosine schedule with 50-step warmup
- Effective batch size: 64 (per-device batch=4, 4 GPUs, grad_accum=4)
- Epochs: 3 (validation loss increased at epoch 4 — early stopping triggered)
- Weight decay: 0.01
- Validation metrics: accuracy on multiple-choice questions (87%), ROUGE-L on free-text answers (0.42), human evaluation rating (4.2/5)

Training curves: training loss dropped from 2.1 to 0.8 over 3 epochs. Validation loss dropped from 2.0 to 1.2 at epoch 2, then plateaued. The slight gap between training (0.8) and validation (1.2) loss indicates mild overfitting — acceptable given the performance level.

### Interview Questions

**Q: Why is the instruction part of the input masked from the loss computation during fine-tuning?**
A: We only want the model to learn to generate good responses, not to predict the instruction. If the loss included instruction tokens, the model would allocate capacity to learning to predict the user's question — which is useless (the user provides the question, the model does not need to predict it). Masking instruction tokens focuses all gradient signal on the response, making training more efficient. This also prevents the model from learning shortcut patterns like echoing the instruction.

**Q: How do you detect and prevent overfitting during fine-tuning?**
A: Monitor validation loss and task-specific metrics after each epoch. Overfitting signs: validation loss stops decreasing or starts increasing while training loss continues decreasing, or validation task metrics plateau/decline. Prevention strategies: (1) early stopping — stop when validation metrics stop improving, typically after 1-3 epochs, (2) LoRA at low rank (r=4-8) acts as a regularizer, (3) use the largest and most diverse dataset available, (4) apply weight decay, (5) keep dropout layers active, (6) use a validation set that matches the real task distribution, not just a random split — random splits can overestimate performance if the data has systematic patterns.

### Related Concepts
Fine-tuning, Loss Functions, Overfitting, Evaluation Metrics

---

## Evaluation of Fine-tuned Models
**Definition:** Assessing fine-tuned model quality through task-specific metrics, human evaluation, LLM-as-judge scoring, and generalization testing.

### Theory & Explanation

Evaluating a fine-tuned model goes beyond tracking validation loss. Multiple evaluation dimensions are needed to ensure the model performs well on the target task without regressing on general capabilities.

**Task-specific metrics** measure performance on the target task directly:
- **Classification:** accuracy, F1, precision, recall, AUC-ROC
- **Extraction / QA:** exact match (EM), F1 over token overlap, character-level match
- **Generation:** BLEU (precision of n-gram overlap), ROUGE (recall of n-gram overlap), METEOR (aligns synonyms and paraphrases)
- **Code:** pass@k (functional correctness of generated code)
- **Math:** accuracy on symbolic math benchmarks

These metrics correlate reasonably well with task performance but do not capture fluency, coherence, or subtle errors.

**Human evaluation** remains the gold standard for open-ended generation tasks. Raters compare model outputs on dimensions like helpfulness, accuracy, coherence, harmlessness, and format compliance. Common protocols: pairwise comparison (which of two responses is better), Likert scale rating (rate 1-5 on each dimension), and best-of-N selection. Human evaluation is expensive but catches subtle issues that automated metrics miss — factual inaccuracies that read fluently, subtle biases, and inappropriate tone.

**LLM-as-judge** uses a strong LLM (GPT-4, Claude) to evaluate model outputs. The judge LLM is given a rubric and asked to score or compare responses. MT-Bench (multi-turn conversation benchmark) uses GPT-4 to score responses on a 1-10 scale. AlpacaEval uses GPT-4 to compare against a reference model (GPT-4 or Davinci). LLM-as-judge correlates reasonably well with human judgment (0.5-0.7 Spearman correlation) and is much cheaper and faster. However, it has biases: it tends to prefer its own outputs (self-enhancement bias), prefers longer responses, and may miss subtle errors in its area of weakness.

**A/B testing** measures real-world impact by deploying both the old and new model to different user segments and comparing user engagement metrics: click-through rate, task completion rate, user satisfaction scores, and retention. This is the ultimate evaluation — no offline metric perfectly predicts real-world performance.

**Catastrophic forgetting evaluation** tests whether the fine-tuned model retains its general capabilities. The model should be evaluated on held-out benchmark tasks:
- General knowledge: MMLU, ARC
- Reasoning: GSM8K (math), BigBench
- Coding: HumanEval, MBPP
- Safety: TruthfulQA, BBQ, harmful prompt refusal rate
If performance drops significantly on these benchmarks, the fine-tuning has caused catastrophic forgetting — the model traded general capability for task-specific performance.

### Example

Evaluating a fine-tuned medical Q&A model:

| Metric | Before FT | After FT | Notes |
|--------|----------|---------|-------|
| Medical benchmark accuracy | 72% | 87% | +15% — successful task adaptation |
| MMLU (general knowledge) | 82% | 81% | -1% — minimal forgetting |
| GSM8K (math reasoning) | 78% | 76% | -2% — acceptable |
| HumanEval (coding) | 74% | 70% | -4% — some code capability loss |
| Harmful refusal rate | 95% | 93% | Acceptable |
| LLM-as-judge score (GPT-4) | 7.2 | 8.5 | Improved helpfulness |
| Human preference (pairwise) | Baseline | 72% preferred | Strong improvement |

The model gains significantly on the target domain while losing minimal general capability. If MMLU had dropped to 60%, that would signal severe forgetting — the model might become unusable for general tasks.

### Interview Questions

**Q: Why is human evaluation still necessary when we have automated metrics?**
A: Automated metrics like BLEU/ROUGE measure surface-level text similarity, not meaning. A response can have perfect ROUGE scores while being factually wrong but using similar vocabulary. Conversely, a correct paraphrase with different vocabulary gets a low ROUGE score. Human evaluation catches: factual accuracy (does the response contain any false statements?), appropriateness (is the tone right for the context?), safety (does the response avoid harmful content?), and subtle quality issues (is the reasoning sound even if the conclusion is right?). LLM-as-judge improves on surface metrics but introduces its own biases. A robust evaluation uses all three: automated metrics for quick iteration, LLM-as-judge for regular evaluation, and human evaluation for final release decisions.

**Q: How do you evaluate whether fine-tuning caused catastrophic forgetting?**
A: Run the fine-tuned model on standard benchmarks that test general capabilities. Compare scores before and after fine-tuning. Key benchmarks: MMLU (world knowledge across 57 subjects), ARC (science reasoning), GSM8K (math), HumanEval (coding), TruthfulQA (factual accuracy). If performance drops by more than 3-5% on any benchmark, the fine-tuning may be causing significant forgetting. Mitigations: (1) mix general data with task data during fine-tuning (5-10% general data), (2) use a lower learning rate, (3) use LoRA instead of full fine-tuning (LoRA preserves base model capabilities better), (4) use multi-task fine-tuning that includes general tasks alongside the target task.

### Related Concepts
Fine-tuning, Evaluation Metrics, Catastrophic Forgetting, LLM-as-Judge
