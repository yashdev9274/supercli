# 5. LLMs, RAG, PROMPT ENGINEERING, AGENTS, GRAPH ML, FINE-TUNING, EVALUATION

## LLMs (Large Language Models)
**Definition:** Transformer-based neural networks with billions of parameters trained on internet-scale text via next-token prediction. Exhibit emergent abilities: reasoning, translation, code generation.

### Theory & Explanation

Large Language Models are deep neural networks built on the Transformer architecture, characterized by having billions (and more recently trillions) of parameters. They are trained through self-supervised learning on massive text corpora — essentially the entire public internet, books, academic papers, and code repositories. The core training objective is next-token prediction: given a sequence of tokens, the model learns to predict the most likely next token. This simple objective, scaled to trillions of training examples, forces the model to learn grammar, factual knowledge, reasoning patterns, translation, code syntax, and even some degree of world modeling. The pre-training phase is computationally massive — GPT-4 is estimated to have cost over $100 million in compute. After pre-training, models undergo instruction tuning and preference optimization (RLHF or DPO) to align with human preferences for helpfulness, honesty, and safety.

Scaling laws, first formalized by Kaplan et al. (2020) from OpenAI and later refined by the Chinchilla scaling laws (Hoffmann et al., 2022), describe a power-law relationship between model performance and three factors: model size (parameters), dataset size (tokens seen during training), and compute budget (FLOPs). The key insight is that these three factors must be scaled together for optimality. The Chinchilla scaling law showed that for every doubling of model parameters, the training data should also double — a finding that led to training smaller models on more data (Chinchilla 70B outperformed Gopher 280B). Beyond a certain scale, emergent abilities appear that were not explicitly trained for: arithmetic reasoning, theory of mind, in-context learning, and chain-of-thought reasoning. These abilities only manifest at scale and cannot be predicted by extrapolating small-model performance curves.

LLMs generate text auto-regressively: given a prompt, the model produces one token at a time, with each token conditioned on all previous tokens. The generation process has three key controls. Temperature (0.0 to 2.0) controls the randomness of token sampling — low temperature (0.1) makes output deterministic and focused, high temperature (0.8+) makes it creative and diverse. A temperature of 0.0 selects the most likely token every time (greedy decoding). Top-p (nucleus sampling) selects from the smallest set of tokens whose cumulative probability exceeds p — if p=0.9, the model only samples from tokens that together have 90% probability mass, cutting off the long tail of unlikely tokens. Top-k restricts sampling to the k most likely tokens at each step. These parameters are typically combined: for factual tasks, use low temperature (~0.1-0.3) and high top-p; for creative tasks, use temperature ~0.7-0.9.

Context window size determines how many tokens the model can process at once. Early models like GPT-3 had 2K token context windows; modern models support 4K (GPT-3.5), 8K-32K (GPT-4), 128K (Claude 3, GPT-4 Turbo), 200K (Claude 3.5, Gemini 1.5 Pro), and even 1M-10M (Gemini 1.5 Pro experimental). Larger context windows enable processing entire documents, codebases, or hour-long videos. However, effective usage of long context remains challenging — models exhibit lost in the middle issues where information in the middle of the context is less reliably used than information at the beginning or end. The KV (Key-Value) cache is a critical optimization for inference: as the model generates tokens auto-regressively, it caches the key and value tensors from previous attention computations so they don't need to be recomputed for each new token. KV cache size grows linearly with sequence length and batch size, often becoming the primary memory bottleneck during generation — a 70B model generating 2K tokens might use 40GB+ just for KV cache.

Quantization reduces model precision from FP16/BF16 to INT8 or INT4, reducing memory footprint 2-4x with minimal quality loss. Post-training quantization (PTQ) techniques like GPTQ, AWQ, and GGUF apply rounding and calibration to minimize error. Quantization enables running large models on consumer hardware — a 70B parameter model at 4-bit quantization fits in roughly 35GB of memory. Activation quantization is more challenging than weight quantization due to outliers. Inference engines like vLLM, TensorRT-LLM, and llama.cpp combine quantization with optimizations like continuous batching, PagedAttention (managing KV cache like virtual memory pages), and speculative decoding (using a small draft model to predict multiple tokens at once, verified by the large model in parallel).

### Example

GPT-4 with 1.7 trillion parameters and a 100K token context window. Zero-shot example: Prompt "Translate to French: Hello" generates "Bonjour" without any examples. Few-shot example: Provide 3 sentiment examples ("I love this movie: Positive", "This is terrible: Negative", "It was okay: Neutral") then prompt "The product is amazing:" — the model classifies as "Positive" by pattern matching the examples. Chain-of-Thought: On the GSM8K math benchmark, standard prompting achieves roughly 30% accuracy. Adding "Let's think step by step" before the answer (CoT prompting) improves accuracy to roughly 70% because the model generates intermediate reasoning steps before the final answer, reducing arithmetic errors. Temperature comparison: With temperature=0, multiple runs produce identical output; with temperature=0.8, the same prompt might produce different but equally valid responses.

### Interview Questions

**Q: What makes LLMs fundamentally different from smaller language models like BERT or traditional NLP models?**

A: Three key differences. First, scale: LLMs have billions to trillions of parameters trained on internet-scale data, while BERT-based models have hundreds of millions. Second, emergent abilities: smaller models show no ability for in-context learning, chain-of-thought reasoning, or instruction following — these capabilities appear only above a threshold (roughly 1B+ parameters for basic ICL, 100B+ for advanced reasoning). Third, architecture: LLMs use decoder-only transformers optimized for generation (causal attention masks), while BERT uses encoder-only (bidirectional attention) optimized for understanding and classification. LLMs are few-shot learners by default; traditional models require task-specific fine-tuning. LLMs exhibit world knowledge compression — they learn facts, relationships, and reasoning patterns during pre-training; BERT learns representations useful for transfer learning but lacks generative capability.

**Q: Explain temperature, top-p, and top-k for controlling text generation.**

A: These parameters control the randomness and diversity of token sampling during autoregressive generation. Temperature (range 0-2, default ~1.0) scales the logits before softmax: temperature approaching 0 makes the highest-probability token dominant (greedy, deterministic output); higher temperatures flatten the probability distribution, making low-probability tokens more likely to be chosen (creative, diverse output). Temperature 0 is equivalent to always picking the argmax token. Top-k sampling restricts the next token selection to the k most likely tokens at each step, cutting off the long tail. For example, top-k=40 means the model only considers the 40 tokens with the highest probabilities. Top-p (nucleus sampling) is more adaptive: it selects the smallest set of tokens whose cumulative probability exceeds p. If p=0.9, the set grows for uniform distributions and shrinks for peaked ones. These are typically combined: top-k=40 first narrows candidates, then top-p=0.9 selects from within those, then temperature scaling is applied before sampling. For factual and QA tasks, use low temperature (0.1-0.3) and high top-p (0.95). For creative writing, use temperature 0.7-0.9 and top-p 0.9.

**Q: What are scaling laws for LLMs and what do they imply?**

A: Scaling laws describe power-law relationships between model performance and three factors: number of parameters (N), dataset size (D), and compute budget (C). The original Kaplan scaling law (2020) showed that performance improves predictably with scale — doubling parameters or data gives consistent log-linear improvement. The Chinchilla scaling law (2022) from DeepMind refined this: for compute-optimal training, model size and training tokens should be scaled equally — N and D should both double together. Previously, models were undertrained (too many parameters, not enough data), so Chinchilla 70B, trained on 1.4 trillion tokens, outperformed Gopher 280B trained on only 300B tokens. Implications: (1) Compute budget is the binding constraint — you trade off model size versus data size. (2) Smaller models trained on more data can match larger undertrained models. (3) Emergent abilities cannot be predicted from scaling curves of smaller models — they appear as phase transitions at specific scales. (4) The cost of training frontier models is dominated by compute, not data acquisition.

### Related Concepts
Transformers, Pre-training, In-Context Learning, Fine-tuning

---

## RAG (Retrieval-Augmented Generation)
**Definition:** Architecture combining document retrieval with LLM generation. Retrieves relevant context from knowledge base, injects into prompt, LLM generates grounded answer reducing hallucinations.

### Theory & Explanation

Retrieval-Augmented Generation addresses the fundamental limitation of LLMs: they have a fixed knowledge cutoff (the date their training data ended), they cannot access private or proprietary information, and they hallucinate when asked about unfamiliar topics. RAG solves this by connecting the LLM to an external knowledge base — documents, databases, APIs — at inference time. The core pipeline: user query comes in, optionally gets rewritten or decomposed, a retriever searches the knowledge base for relevant documents, those documents are ranked and injected into the LLM's context window, and the LLM generates an answer grounded in the retrieved context. Because the LLM can cite sources and is constrained to answer based on provided context, hallucinations are dramatically reduced. RAG also enables updating knowledge without retraining — just add or modify documents in the knowledge base.

The retrieval stage is the most critical component and typically uses hybrid search combining dense embeddings and sparse (BM25) retrieval. Dense retrieval: documents are split into chunks (typically 256-1024 tokens), each chunk is embedded into a high-dimensional vector (768-3072 dimensions) using an embedding model like OpenAI ada-002, Cohere embed-v3, or open-source models like bge-large, E5, or GTE. The query is embedded with the same model, and cosine similarity or dot product finds the nearest chunks. BM25 provides lexical matching — it is a bag-of-words ranking function that handles exact keyword matches and term frequency. Hybrid search combines both using Reciprocal Rank Fusion (RRF): RRF score = sum(1/(k + rank_i)) for each result in each ranking, merging results into a final combined ranking. This is robust because dense retrieval captures semantic similarity (what is the policy on working from home matches remote work policy), while BM25 captures exact terms (refund policy matches documents containing those exact words).

Chunking strategy significantly impacts retrieval quality. Fixed-size chunking splits at token boundaries (e.g., every 512 tokens with 128-token overlap) — simple but can split sentences mid-thought. Semantic chunking uses embedding similarity to detect topic boundaries, creating chunks aligned with topical shifts. Recursive chunking applies multiple levels: small chunks (256 tokens) for granular precision, with parent chunks (2048 tokens) providing surrounding context when a small chunk is retrieved — the parent retriever pattern retrieves small chunks but returns their parent documents for the LLM context, balancing precision with context completeness. Document structure (headings, sections, list items) provides natural chunk boundaries. Metadata (document title, date, section, page number) is attached to each chunk for filtering and source citation.

Vector databases (Pinecone, Chroma, Weaviate, Qdrant, Milvus) store embeddings and provide Approximate Nearest Neighbor (ANN) search. The standard ANN algorithm is Hierarchical Navigable Small Worlds (HNSW), which builds a multi-layer graph structure: lower layers contain more nodes and provide fine-grained navigation, higher layers are sparser for coarse search. HNSW offers O(log n) search complexity with high recall. Production vector databases add: metadata filtering (filter chunks by date, source, category before vector search), scalar quantization (compressing float32 vectors to int8 for 4x memory reduction), partitioning and namespacing (separate indexes for different clients or data types), and serverless architectures (Pinecone serverless, Chroma Cloud) that decouple storage from compute for cost efficiency at scale. The choice of embedding model is critical — domain-specific embedding models (e.g., Legal-BERT, BioBERT) significantly outperform general models on specialized retrieval tasks.

The generation stage deserves equal attention. The classic RAG pattern simply concatenates retrieved chunks before the user query in the prompt. More sophisticated approaches include: (1) Re-ranking using a cross-encoder (e.g., Cohere rerank-v3, BGE-reranker) that jointly scores query-chunk pairs — cross-encoders are more accurate than bi-encoders but cannot scale to millions of documents, so they are used as a second-stage filter on the top 50-100 results from the bi-encoder. (2) Query rewriting: before retrieval, the system rewrites the user's query to be more search-friendly (e.g., expanding acronyms, adding synonyms, decomposing complex questions into sub-questions). (3) HyDE (Hypothetical Document Embeddings): generate a hypothetical ideal document from the query, embed that, and use it for retrieval — effective when the query is short and the embedding space is better populated by document-like text. (4) Self-RAG: the LLM generates retrieval decisions — when to retrieve, whether retrieved passages are relevant, and whether the generation is supported by them. This creates a dynamic retrieval loop rather than a single retrieval step.

Advanced RAG variants address specific failure modes. Corrective RAG (CRAG) adds a relevance evaluator: if retrieved documents score below a threshold, the system triggers web search to find better sources. Agentic RAG treats retrieval as a tool call within an agent loop — the LLM can decide to retrieve, search the web, perform calculations, or ask clarifying questions before answering. GraphRAG (from Microsoft) builds a knowledge graph from documents by extracting entities and relationships, then uses community detection and summarization for global sensemaking queries. Self-RAG trains the LLM to output special tokens indicating retrieval needs and passage relevance, improving answer faithfulness. The RAPTOR model builds a hierarchical summary tree over document chunks, enabling retrieval at multiple abstraction levels — a query about a general topic retrieves a high-level summary, while a specific question drills into leaf-level chunks.

Common RAG failure modes and their fixes include: (1) Irrelevant retrieval: solution — query rewriting, HyDE, or adding a reranker that filters irrelevant passages before the LLM sees them. (2) Missing context (the answer is not in the retrieved chunks): solution — increase top-k, adjust chunk size, use sliding window chunks with overlap, or implement the parent retriever to provide broader context. (3) LLM ignores provided context: solution — strengthen the system prompt to emphasize context-only answering, use structured prompts with clear context and query separation, or fine-tune the model to follow context instructions (instruction-tuned models are less prone to this). (4) Lost in the middle (relevant chunk in the middle of context): solution — place the most relevant chunk last (recency bias) or first (primacy bias), or reorder chunks by relevance in descending order.

### Example

Company policy Q&A system: 500 PDFs of HR and IT policies are chunked into 100,000 chunks (512 tokens each, 128-token overlap). Each chunk is embedded with OpenAI ada-002 (1536 dimensions) and stored in a Pinecone serverless index. User asks: "What is our remote work policy?" The query is first rewritten by a small LLM to "remote work policy and WFH guidelines 2025." Hybrid search retrieves the top 20 chunks (10 via dense cosine similarity, 10 via BM25 lexical match). These are fused with RRF (k=60) and the top 5 are passed to a cross-encoder reranker (BGE-reranker-v2-m3). The top 3 reranked chunks are injected into the GPT-4 prompt. The final prompt is: "You are a helpful assistant. Answer the question based ONLY on the following context. If the context does not contain the answer, say you do not know. Context: [chunk1] [chunk2] [chunk3]. Question: What is our remote work policy?" GPT-4 generates a concise answer citing specific policy sections and page numbers from the PDFs. No hallucination is possible because the answer must cite the provided context.

### Interview Questions

**Q: RAG vs Fine-tuning vs Prompt Engineering — when to use each?**

A: RAG is for knowledge access — use when the LLM needs external or up-to-date information that it was not trained on, such as company policies, product documentation, or recent news. Fine-tuning is for behavior and style adaptation — use when you need consistent output format, tone, or domain-specific terminology that prompting alone cannot achieve, such as writing in a specific legal language, following a strict schema, or adapting to a specialized vocabulary. Prompt engineering is for quick task adaptation — use for simple formatting, role-playing, or instruction-following where few-shot examples suffice. In practice, these are used together: RAG provides factual grounding, prompt engineering structures the interaction, and fine-tuning handles specialized output requirements. RAG wins for evolving knowledge (no retraining needed), fine-tuning wins for deep behavioral changes, and prompt engineering wins for rapid iteration.

**Q: How to evaluate RAG system quality?**

A: RAG evaluation covers both retrieval quality and generation quality. Retrieval metrics: hit rate (percentage of queries where at least one relevant chunk is in the top-k), mean reciprocal rank (MRR — rank position of the first relevant result), normalized discounted cumulative gain (nDCG — accounts for graded relevance), and precision at k. Generation metrics from the RAGAS framework: faithfulness (does the answer stay true to the retrieved context — measured by decomposing the answer into claims and verifying each against the context), answer relevancy (does the answer address the question), context precision (are the retrieved chunks relevant to the question), and context recall (are all necessary chunks retrieved). Additional evaluation: human preference ratings, LLM-as-judge scoring with GPT-4 or Claude as evaluator, and A/B testing on live user traffic. A production RAG system should have automated evaluation pipelines that run on every knowledge base update.

**Q: Common RAG failures and how to fix them?**

A: Four major failure modes exist. (1) Irrelevant retrieval — the retrieved chunks are not about the query. Fixes: query rewriting (expand the query with synonyms and context), HyDE (embed a hypothetical ideal answer instead of the query), add a cross-encoder reranker, improve chunk quality with semantic chunking. (2) Missing context — the answer exists in the knowledge base but was not retrieved. Fixes: increase top-k, reduce chunk size to improve precision, use sliding window chunks with overlap, implement parent retriever for broader coverage, improve embedding model quality. (3) LLM ignores context — the model generates answers from its pre-training knowledge instead of the provided context. Fixes: strengthen system prompt (emphasize context-only answering with explicit instructions), use structured prompt format with clear separation between context and query, fine-tune the model on context-following tasks, use instruction-tuned models. (4) Lost in the middle — relevant chunk is in the middle of the context and the model ignores it. Fixes: reorder chunks by relevance (most relevant last or first), reduce total context length, use models with better long-context attention mechanisms.

### Related Concepts
LLMs, Vector Databases, Embeddings, Fine-tuning

---

## Prompt Engineering
**Definition:** Designing input prompts to get desired outputs from LLMs. Critical skill for effective LLM use.

### Theory & Explanation

Prompt engineering is the practice of carefully crafting inputs to large language models to elicit desired behaviors, formats, and reasoning patterns. It has emerged as a critical skill because LLMs are highly sensitive to phrasing, structure, and the examples provided in the prompt. A well-engineered prompt can dramatically improve output quality — sometimes doubling accuracy on reasoning tasks — while a poorly designed prompt leads to irrelevant, incorrect, or poorly structured responses. The fundamental components are the system prompt (sets the role, persona, rules, and constraints for the model's behavior throughout the conversation) and the user prompt (the specific query or task). Separating these allows fine-grained control: the system prompt establishes persistent guardrails while the user prompt handles the specific request.

Zero-shot prompting gives the model a task without examples. It relies entirely on the model's pre-training and instruction-following ability. This works well for common tasks (translation, summarization, simple classification) but fails for nuanced or domain-specific tasks. Few-shot prompting provides 2-5 examples of input-output pairs before the target query, leveraging the model's in-context learning ability. The examples serve as implicit instructions about format, reasoning style, edge cases, and output structure. Few-shot is more reliable but costs more tokens. Key considerations for few-shot: examples should cover edge cases (not just the most common patterns), be representative of the task distribution, and be ordered from simple to complex. Chain-of-Thought (CoT) prompting instructs the model to output its reasoning process step by step before the final answer. This was introduced by Wei et al. (2022) and dramatically improves performance on arithmetic, common sense, and symbolic reasoning tasks. CoT works by offloading intermediate computation into the output tokens, effectively giving the model more compute at test time. Accuracy on math benchmarks improves from roughly 30% to 70% with CoT. Variants include zero-shot CoT (just add "Let's think step by step"), few-shot CoT (provide reasoning examples), and tree-of-thought (explore multiple reasoning paths simultaneously).

Structured output prompting forces the model to generate parseable formats like JSON, XML, or Markdown tables. Best practices include: specifying the exact schema in the prompt, providing an example output, using delimiters to separate sections clearly, and instructing the model not to include markdown code fences around JSON. For mission-critical parsing, constrained decoding techniques like grammar-guided generation (Outlines library, lm-format-enforcer) or JSON-mode APIs (OpenAI JSON mode, Gemini response_schema) enforce the output structure at the token probability level, guaranteeing valid JSON. Without these, LLMs may occasionally produce malformed JSON with trailing commas, missing brackets, or extra text.

Advanced prompting techniques include: (1) ReAct (Reasoning + Acting) — interleave reasoning steps with tool calls, enabling agents to gather information and act upon it. The format is Thought: ... Action: tool_name(input) ... Observation: ... Final: ... (2) Self-Consistency — generate multiple outputs with high temperature, then take the majority vote or most consistent answer. Improves reliability by 5-15% on reasoning tasks. (3) Chain-of-Note — generate retrieval notes before answering in RAG, improving answer quality. (4) Structured Chain-of-Thought — force the model to fill in pre-defined reasoning steps rather than free-form reasoning. (5) Constitutional AI — provide the model with principles and rules it must follow, used for safety alignment without human feedback. (6) Negative prompting — explicitly telling the model what NOT to do, often as effective as positive instructions. For example: "Do not include any information that is not in the provided context. Do not speculate. Do not give medical advice."

Best practices for prompt engineering include: be specific and precise about the desired output, put instructions at the beginning of the prompt (primacy effect), use delimiters to separate sections (triple quotes, XML tags, markdown headers), provide few-shot examples for format and edge cases, ask the model to reason step by step for complex tasks, limit scope to a single task per interaction, use persona and role-setting to establish context, and iterate systematically (change one variable at a time, track performance). The prompt should be treated as code — version controlled, tested, and optimized through systematic experimentation.

### Example

System prompt: "You are a data science tutor specializing in SQL. Your role is to help users write SQL queries given natural language questions and database schemas. Only use tables and columns from the provided schema. If a query cannot be written with the available schema, explain why. Format your response as: Explanation: [step-by-step reasoning], SQL: [the generated query]."

Few-shot examples: Provide 2 examples of question-to-SQL pairs. Example 1: Schema: users(id, name, email, signup_date). Question: "How many users signed up in 2024?" SQL: "SELECT COUNT(*) FROM users WHERE signup_date BETWEEN '2024-01-01' AND '2024-12-31';" Example 2: Same schema. Question: "List all users who signed up in the last 30 days." SQL: "SELECT name, email FROM users WHERE signup_date >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY);"

User prompt: "Schema: {schema}. Question: {question}"

The CoT version adds: "Let's think step by step. First, identify the tables needed. Second, identify the columns. Third, identify filtering conditions. Fourth, construct the query." This structured reasoning reduces column name hallucinations and join errors by roughly 60% compared to direct generation.

### Interview Questions

**Q: What is Chain-of-Thought prompting and why does it work?**

A: Chain-of-Thought prompting instructs the LLM to output intermediate reasoning steps before arriving at a final answer. It works because: (1) It offloads computation into the output tokens — autoregressive generation effectively gives the model more compute for reasoning by using each output token as an intermediate computation step. (2) It breaks complex problems into manageable sub-steps, reducing the cognitive load on a single attention pass. (3) It creates a verifiable reasoning chain — if the final answer is wrong, you can identify which step failed. (4) It aligns with how training data is structured (many reasoning traces exist in pre-training text). On the GSM8K math benchmark, standard prompting achieves roughly 30% accuracy. Zero-shot CoT (adding "Let's think step by step") improves to roughly 70%. Few-shot CoT (providing 8 reasoning examples) reaches roughly 92% with GPT-4. CoT is most effective for math, logic, coding, and multi-step reasoning tasks. It provides little benefit for simple factual recall or classification tasks.

**Q: Zero-shot vs Few-shot prompting — when to use each?**

A: Zero-shot prompting should be used when the task is common and well-represented in the model's training data (translation between major languages, summarization of news articles, general question answering, simple sentiment analysis), when token costs or latency constraints limit prompt length, or when iterating quickly on prompt design. Few-shot prompting should be used for domain-specific tasks (legal document classification, medical terminology extraction, custom data formats), when output format consistency is critical (structured JSON, specific XML schemas), when the task has edge cases that need explicit handling, or when zero-shot performance is below acceptable thresholds. Few-shot is generally more reliable because examples serve as implicit instructions — a model might misinterpret "extract the date" in zero-shot (which date? which format?) but two examples make it unambiguous. The trade-off is token cost: each example adds tokens to every request. A good practice is to start with few-shot, then distill the examples into the instruction text if they become stable, gradually moving toward zero-shot for efficiency.

**Q: How to structure a prompt for reliable structured output?**

A: For reliable structured output (typically JSON), follow these principles: (1) Define the exact schema in the prompt — specify each field name, type, allowed values, and nesting structure. (2) Provide one complete example output with correct formatting. (3) Use a system prompt to set strict format rules: "Always respond with valid JSON only. No markdown, no code fences, no explanation outside the JSON." (4) Use delimiters to separate the schema definition, example, and actual input. (5) For production systems, use constrained decoding — OpenAI's JSON mode, Gemini's response_schema parameter, or libraries like Outlines or lm-format-enforcer that enforce the grammar at generation time. (6) Always validate and parse the output server-side with a JSON parser, with error handling for malformed responses. (7) In few-shot, include both typical and edge cases. Example: System: "You are a JSON generator. Output ONLY valid JSON according to the schema." User: "Schema: {name: string, age: number, email: string}. Example: {name: 'John Doe', age: 30, email: 'john@example.com'}. Now output JSON for: {input}."

### Related Concepts
LLMs, In-Context Learning, Agents

---

## Agents & Tool Use
**Definition:** LLM-powered systems that perceive, reason, use tools (APIs, search, code), and act autonomously via ReAct loop.

### Theory & Explanation

An LLM agent is an autonomous system that combines a language model with tools, memory, and planning capabilities to accomplish complex tasks that require multiple steps, external information, and interaction with the world. Unlike a standard LLM that passively generates text from a prompt, an agent actively decides what to do next based on observations from its environment. The core loop, popularized by the ReAct (Reasoning + Acting) pattern, is: (1) Thought — the LLM reasons about the current state and decides what needs to be done. (2) Action — the LLM outputs a structured command to invoke a tool, such as searching the web, calling an API, executing code, or querying a database. (3) Observation — the tool's output is fed back into the LLM's context. (4) Repeat — the LLM processes the observation, generates a new thought, and decides on the next action. (5) Final — when the task is complete, the LLM outputs the final answer. Each cycle extends the context window, providing a running trace of the agent's reasoning and actions.

Tools are the bridge between the LLM and the external world. A tool is defined by its name, description, input parameters (JSON schema), and output format. The LLM uses function calling — it outputs a JSON object specifying which tool to call and with what parameters. The system intercepts this JSON, executes the tool, and returns the result as an observation. Common tool categories include: (1) Information retrieval — web search, vector database query, document loaders. (2) Computation — Python interpreter, calculator, symbolic math engine. (3) APIs — Slack, email, CRM, calendar, GitHub, database query. (4) Code execution — sandboxed Python/JavaScript runtime for code generation tasks. (5) Memory — store and retrieve information across sessions. The tool description is critical for correct selection — the LLM uses it to decide which tool matches the current need. A vague description leads to wrong tool selection; a precise description with usage examples improves accuracy.

Memory in agents operates at multiple levels: (1) Short-term memory — the conversation history within the current context window. This is limited by the model's context length but provides rich, detailed information about recent actions. (2) Long-term memory — external storage (vector database, key-value store, SQL database) where the agent can save and retrieve information across sessions. This is essential for personalized agents that need to remember user preferences, past interactions, and ongoing tasks. (3) Episodic memory — records of past agent runs, including successful and failed strategies, which the agent can learn from. (4) Procedural memory — stored tool definitions and action patterns. Managing context window limits is a major engineering challenge: agents that run for many steps eventually fill the context. Solutions include summarization (compress older turns), sliding windows (drop oldest turns), and retrieval-augmented memory (store past turns in a vector DB and retrieve relevant ones).

Planning enables agents to handle complex, multi-step tasks that cannot be completed in a single action cycle. (1) Task decomposition — break a complex request into sub-tasks. For example, "Book a flight to New York" decomposes into search flights, compare options, select flight, enter passenger details, process payment, confirm booking. (2) Planning with ReAct — the agent discovers the plan dynamically by reasoning about each step. (3) Plan-ahead — the agent generates a complete plan before executing, then executes step by step. (4) Tree-of-Thought — the agent explores multiple planning paths simultaneously, pruning dead ends. (5) Replanning — when an action fails or produces unexpected results, the agent updates its plan. The Plan-and-Solve pattern (Wang et al. 2023) improves over ReAct by generating a high-level plan first, then executing it step by step, reducing backtracking and error recovery costs.

Multi-agent systems coordinate multiple specialized agents to solve complex problems. Common patterns include: (1) Orchestrator + Workers — a supervisor agent decomposes tasks and delegates to specialized worker agents (researcher, coder, reviewer). (2) Debate — multiple agents with different perspectives discuss a problem and converge on an answer, improving correctness. (3) Hierarchical — agents at different levels of abstraction (strategic, tactical, operational). Popular frameworks include LangGraph (state-machine-based agent orchestration with cycles, conditional edges, and persistent state), AutoGen (Microsoft's multi-agent conversation framework), and CrewAI (role-based agent teams with task delegation). LangGraph is the most flexible, allowing developers to define agents as nodes in a directed graph with explicit state management — this enables complex patterns like human-in-the-loop, parallel agent execution, and dynamic tool assignment.

Safety and guardrails are essential for production agent systems. Key risks include: (1) Tool abuse — the agent calling expensive APIs in infinite loops. Mitigation: rate limiting, budget tracking per session, max step limits, timeout per tool call. (2) Prompt injection — user input that hijacks the agent's system prompt. Mitigation: input sanitization, separating user input from instructions, using different models for different trust levels. (3) Hallucination propagation — a hallucinated observation leading to further hallucinated reasoning. Mitigation: verification steps, confidence thresholds, human approval for high-stakes actions. (4) Data leakage — the agent writing sensitive information to external tools. Mitigation: output filtering, data classification labels, allowlists for tool outputs. Guardrails frameworks like NVIDIA NeMo Guardrails, Guardrails AI, and LangChain's Guardrails provide programmable safety rules that intercept and validate agent actions before execution.

### Example

Customer support agent for an e-commerce company. User sends a message: "Where is my order #ORD12345? It was supposed to arrive yesterday." The agent begins its ReAct loop. Thought: "The user is asking about their order status. I need to retrieve order information. I will use the get_order function with the order ID." Action: get_order(order_id="ORD12345"). Observation: returns {status: "shipped", carrier: "FedEx", tracking: "FX123456789", estimated_delivery: "2025-07-21", current_location: "Memphis, TN hub", last_scan: "2025-07-20 06:30 AM"}. Thought: "The package is still in transit at the Memphis hub. It is one day late. I should inform the user and offer options — they may want to contact the carrier or get a refund for shipping." Action: get_shipping_policy(carrier="FedEx", delay_days=1). Observation: returns {policy: "FedEx guarantees Ground delivery within 5 business days. Late deliveries qualify for shipping fee refund on request."} Final thought: "I now have enough information to respond to the user." Final response: "Your order ORD12345 is currently at the FedEx Memphis hub and is running one day late. The new estimated delivery is tomorrow, July 21. Since it is past the original delivery date, you are eligible for a shipping fee refund per our carrier policy. Would you like me to initiate the refund request? You can also track the package in real-time here: fedex.com/track/FX123456789."

If the user then asks "Yes, please refund shipping," the agent loops again: Thought: "User wants a shipping refund. I need to initiate a refund request. The get_order showed the payment method was Visa ending in 4242." Action: initiate_shipping_refund(order_id="ORD12345", reason="delayed_delivery"). Observation: returns {refund_id: "RF9876", status: "approved", amount: "$12.99", estimated_credit: "3-5 business days"}. Final: "I have initiated a $12.99 shipping refund. It will be credited to your Visa ending in 4242 within 3-5 business days. Your refund ID is RF9876 for reference."

### Interview Questions

**Q: Difference between RAG and an Agent?**

A: RAG is a passive retrieval system — it retrieves information once based on the query and injects it into the prompt before the LLM generates a response. The LLM does not decide whether or when to retrieve; retrieval is a fixed preprocessing step. An agent is an active decision-maker — it decides what to do, when to use tools, how many times to loop, and when to stop. Agents can retrieve information, then based on that information decide to retrieve more, perform a calculation, call an API, or ask a clarifying question. RAG is a single-turn pattern (query in, answer out). Agents are multi-turn loops (perceive, reason, act, observe, repeat). RAG is appropriate when the task is straightforward factual Q&A. Agents are necessary when the task requires multiple steps, conditional logic, tool orchestration, or dynamic information gathering. In practice, many production systems use both: an agent that has retrieval as one of its tools.

**Q: What is the ReAct agent pattern?**

A: ReAct (Reasoning + Acting) is a prompting framework that interleaves reasoning traces with action steps. The pattern is: Thought (what is the current state and what should I do next), Action (call a tool with specific parameters), Observation (tool output is fed back), repeat until the task is complete, then Final (output the answer). The key insight is that reasoning traces help the model keep track of progress, recover from errors, and generalize to novel situations. Without explicit reasoning (just action-observation loops), the model loses context and makes more errors. With reasoning traces, the model can correct itself mid-task. ReAct was shown to outperform both chain-of-thought (reasoning only, no actions) and Act-only (actions without reasoning) on knowledge-intensive tasks. In LangGraph, ReAct is implemented as a state graph where each node is either a reasoning step, a tool call, or a final response, with conditional edges determined by the LLM's output.

**Q: How do you ensure agent safety and prevent harmful actions?**

A: Agent safety requires multiple layers of guardrails. (1) Scope limitation: restrict available tools to only what the agent needs — do not give an agent access to production database writes, billing APIs, or user password resets unless absolutely necessary. (2) Rate limiting and budget tracking: cap the number of tool calls per session (e.g., max 20 steps), set monetary limits for paid APIs, implement per-minute rate limits. (3) Human-in-the-loop: require human approval for high-risk actions — any action that modifies data, sends messages, spends money, or affects other users should go through a confirmation step. (4) Input validation: sanitize user inputs to prevent prompt injection where malicious input hijacks the agent's instructions. (5) Output filtering: screen generated responses for PII, toxic content, or policy violations before delivery. (6) Timeouts: terminate agent loops that exceed time limits. (7) Monitoring and auditing: log all agent actions, tool calls, and decisions for post-hoc analysis. (8) Determinate state: design the agent to be safe even if it gets stuck in a loop — stateless operations and idempotent tool calls where possible.

### Related Concepts
LLMs, RAG, Function Calling, ReAct

---

## Graph-Based ML & Knowledge Graphs
**Definition:** Models operating on graph data (nodes=entities, edges=relationships). Used for recommendation, fraud, drug discovery, multi-hop reasoning.

### Theory & Explanation

Graph-based machine learning operates on data structured as graphs — collections of nodes (vertices) connected by edges (relationships). Unlike Euclidean data (images, text, audio) where each sample has a fixed grid of neighbors, graph data is irregular: each node can have a variable number of neighbors arranged in arbitrary topology. This fundamental difference makes standard deep learning architectures (CNNs, RNNs, Transformers) inapplicable to graph data without modification. Graph Neural Networks (GNNs) were developed to handle this irregular structure. Key graph concepts: a graph G = (V, E) where V is the node set and E is the edge set. Nodes can have features (attribute vectors), edges can have features (relationship type, weight, direction), and the graph can be directed, undirected, or heterogeneous (multiple node and edge types). The adjacency matrix A encodes connections: A[i][j] = 1 if there is an edge from node i to node j. Node degree is the number of edges incident to a node. Homophily is the tendency of connected nodes to have similar features or labels (social networks: friends share interests). Heterophily is the opposite — connected nodes differ (fraud networks: fraudsters connect to legitimate accounts).

Knowledge Graphs (KGs) are a specific type of graph representing facts as triples: (head entity, relation, tail entity). For example: (Einstein, born_in, Germany), (Germany, located_in, Europe). KGs are used for question answering, recommendation, and reasoning. Querying KGs uses SPARQL (a graph query language similar to SQL for graphs) or Cypher (Neo4j's declarative graph query language). Cypher example: MATCH (p:Person)-[:BORN_IN]->(c:Country)-[:LOCATED_IN]->(cont:Continent) WHERE cont.name = 'Europe' RETURN p.name. This finds all people born in European countries — a two-hop path. KGs built from text typically use named entity recognition (NER) to extract entities and relationship extraction to identify connections. Popular KGs include Wikidata (90M+ entities), DBpedia (extracted from Wikipedia), and domain-specific KGs like UMLS (medical), GeneOntology (biology), and Freebase.

Graph Neural Networks learn node representations by aggregating information from neighbors — this is the message passing framework. In each layer, each node: (1) gathers messages from its neighbors (typically transformed via learned weight matrices). (2) Aggregates those messages (sum, mean, max, or attention-weighted sum). (3) Updates its own representation by combining its previous representation with the aggregated message. After L layers, a node's representation encodes information from its L-hop neighborhood. Key GNN architectures differ in how they perform message passing and aggregation. Graph Convolutional Networks (GCN, Kipf & Welling 2017) apply a normalized adjacency-based convolution: each neighbor's contribution is weighted equally (by degree normalization). Graph Attention Networks (GAT, Velickovic et al. 2018) learn attention weights for each neighbor, allowing the model to focus on more important neighbors — critical for graphs where neighbor relevance varies. GraphSAGE (Hamilton et al. 2017) uses inductive sampling: instead of using all neighbors, it samples a fixed-size neighborhood, enabling scaling to billion-node graphs and generalization to unseen nodes.

GraphRAG is a recently popularized approach from Microsoft that combines knowledge graphs with RAG. The pipeline: (1) Extract entities and relationships from documents using an LLM. (2) Build a knowledge graph connecting these entities. (3) Apply community detection algorithms (Leiden, Louvain) to find groups of closely related entities. (4) Summarize each community using an LLM, producing natural language descriptions of what each community represents. (5) For local questions (specific facts), traverse the KG to find relevant entities. For global questions (trends, themes, summaries), use community summaries. GraphRAG excels at multi-hop reasoning questions that standard RAG struggles with. For example, "How does the company's approach to data privacy affect its cloud storage product roadmap?" requires connecting privacy policies to product features across multiple documents — standard RAG with chunk retrieval may miss these connections, while GraphRAG explicitly models the relationships. GraphRAG is more computationally expensive (requires building and maintaining the KG) but provides superior performance on global sensemaking and multi-hop questions.

Applications of graph ML span many domains. Recommendation systems: nodes are users and items, edges represent interactions (purchases, views, likes). GNNs learn user and item embeddings by propagating information through the interaction graph, capturing collaborative filtering signals. Fraud detection: nodes are accounts, transactions, devices, IP addresses. Fraud patterns often involve sub-graph structures (dense money transfer rings, accounts sharing devices). GNNs can flag suspicious nodes by detecting anomalous neighborhood patterns. Drug discovery: molecules are graphs where atoms are nodes and bonds are edges. GNNs predict molecular properties, drug-target interactions, and toxicity. Social network analysis: community detection, influence propagation, link prediction (predicting future friendships or collaborations). Traffic forecasting: road networks are graphs, GNNs predict traffic flow by modeling spatial dependencies between road segments.

### Example

Fraud detection in financial transactions: The graph has three node types — accounts (100M nodes), transactions (1B nodes), and devices (50M nodes). Edges: account-to-transaction (sent/received), account-to-device (logged_in_from). Each node has features: account has balance, age, transaction history features; transaction has amount, timestamp, location; device has IP, browser fingerprint. A 3-layer GAT network is trained on labeled historical fraud data. Message passing in the first layer aggregates features from connected transactions to an account — an account receiving many small transactions then sending one large outgoing transaction gets flagged. The second layer aggregates across devices — if multiple flagged accounts share the same device, that device becomes high-risk. The third layer propagates device risk to all accounts using that device. GAT's attention mechanism learns that transaction amount and frequency are more important than location for fraud detection. The model achieves 0.95 AUC-ROC, catching 85% of fraud with a 0.1% false positive rate. Link prediction variant: predict whether an account will send money to another account — used for early fraud detection before the transaction completes.

### Interview Questions

**Q: What is GraphRAG and how does it differ from standard RAG?**

A: GraphRAG (Microsoft, 2024) extends standard RAG by building a knowledge graph from the document corpus. The process involves: extracting entities and relationships using an LLM, building a KG, running community detection to find clusters of related entities, summarizing each community with an LLM, and using both the KG (for local/factual questions) and community summaries (for global/abstract questions) at retrieval time. Standard RAG retrieves text chunks via embedding similarity, which works well for single-hop factual questions but struggles with multi-hop questions (connecting information across documents) and global sensemaking questions (trends, themes, synthesis). GraphRAG addresses these by explicitly modeling entity relationships, enabling traversal across multiple hops, and providing community-level summaries for holistic questions. The trade-off: GraphRAG is significantly more expensive to build and maintain (requires LLM calls for entity extraction and community summarization), and it adds latency. Use standard RAG for simple Q&A on well-structured documents, GraphRAG for complex multi-hop questions and analysis across many documents.

**Q: GCN vs GAT — when to use each?**

A: GCN (Graph Convolutional Network) applies a fixed, normalized aggregation where each neighbor contributes equally (weighted by degree normalization). GAT (Graph Attention Network) learns attention weights for each neighbor, dynamically determining which neighbors are more important for the task. Use GCN when: the graph has uniform neighbor importance (citation networks where all cited papers are equally relevant), interpretability is not required, computational resources are limited (GAT is 2-3x more expensive per layer due to attention computation), or the graph is relatively small and simple. Use GAT when: neighbor importance varies significantly (fraud detection where some transactions are more suspicious than others, recommendation where some items are more influential), you want to understand which connections matter most (attention weights provide interpretability), or the graph has high-degree nodes where selective attention is beneficial. In practice, GAT generally outperforms GCN on most benchmarks (2-5% improvement), but GCN trains faster and uses less memory. For production systems, GAT is preferred when the budget allows, especially on heterophilic graphs where connected nodes are dissimilar.

**Q: What is message passing in GNNs?**

A: Message passing is the fundamental computation framework for GNNs. In each layer, every node in the graph: (1) Gathers messages from its neighboring nodes. A message is computed by transforming the neighbor's feature vector through a learned function (typically a linear transformation W * h_neighbor, optionally with edge features). (2) Aggregates all incoming messages using a permutation-invariant function — sum (most common, captures complete neighborhood information), mean (averages out noise, good for high-degree nodes), max (captures strongest signal, good for detecting outliers), or attention-weighted sum (GAT). (3) Updates its own representation by combining its previous representation (from the previous layer) with the aggregated neighbor messages — typically through concatenation followed by a non-linear transformation (ReLU). After k layers, each node's representation encodes information from its k-hop neighborhood. This locality principle is what makes GNNs powerful: they learn node representations that reflect the local graph structure. The parameters (weight matrices) are shared across all nodes, so the same update function applies everywhere — this is what allows GNNs to generalize to graphs of different sizes and structures.

### Related Concepts
RAG, Knowledge Graphs, GNN, GraphRAG

---

## Fine-tuning & Adaptation Methods
**Definition:** Techniques to adapt pre-trained models to specific tasks: full fine-tuning, parameter-efficient methods (LoRA, QLoRA), preference optimization (RLHF, DPO).

### Theory & Explanation

Fine-tuning is the process of adapting a pre-trained model to a specific task or domain by continuing training on task-specific data. The fundamental principle underlying all fine-tuning is transfer learning: a model pre-trained on internet-scale data has already learned general features of language (grammar, reasoning, factual knowledge), and fine-tuning only needs to adapt these general abilities to the specific target domain rather than learning from scratch. This makes fine-tuning dramatically more data-efficient than training from scratch — you can achieve strong performance with as few as 100-1000 high-quality examples, whereas pre-training requires trillions of tokens. However, fine-tuning comes with risks: catastrophic forgetting (the model loses its general capabilities while specializing), overfitting (the model memorizes the fine-tuning data rather than learning patterns), and distribution shift (the fine-tuning data distribution differs from real-world usage).

Full fine-tuning updates all parameters of the model. This achieves the highest potential quality because every weight can adapt to the target task. However, it is computationally expensive — fine-tuning a 7B parameter model requires roughly 56GB of GPU memory for full precision (16-bit) training, and a 70B model requires 560GB+ (requiring 8x A100 80GB GPUs). Full fine-tuning also produces a complete copy of the model for each fine-tuned version, which is storage-intensive (13GB for a 7B model, 140GB for 70B). The key hyperparameters are learning rate (typically 1e-5 to 5e-5, much lower than pre-training), batch size, number of epochs (typically 1-3, more epochs increase overfitting risk), and warmup steps. Learning rate scheduling uses cosine decay or linear decay. Full fine-tuning is most appropriate when: you have large amounts of task-specific data (10K+ examples), you need maximum possible quality, you have the compute budget, and you are not fine-tuning for many different tasks (each requires storing a full copy).

LoRA (Low-Rank Adaptation, Hu et al. 2021) is the most widely used parameter-efficient fine-tuning (PEFT) method. Instead of updating the full weight matrix W, LoRA injects two low-rank matrices A and B such that W' = W + BA, where A is (input_dim x r) and B is (r x output_dim), with r much smaller than the hidden dimension (typically r=8-64 vs d=4096 for a 7B model). The original weight W is frozen (not updated), and only A and B are trained. This reduces trainable parameters from 100% to roughly 0.1-0.5% — a 7B model fine-tuned with rank-8 LoRA trains only about 4 million parameters. The memory savings are substantial: optimizer states (Adam stores 2 states per parameter) are drastically reduced, enabling fine-tuning on consumer GPUs. LoRA adapters can be merged into the original weights at inference time (W + BA computed once), resulting in zero inference latency overhead and no increase in model size at serving time. Multiple LoRA adapters can be trained for different tasks and swapped at inference time without reloading the base model — enabling efficient multi-task serving from a single base model. LoRA is typically applied to attention projection matrices (Q, K, V, O), but can also be applied to FFN layers.

QLoRA (Quantized LoRA, Dettmers et al. 2023) combines LoRA with 4-bit quantization of the base model. The base model weights are quantized to 4-bit NormalFloat (NF4) format, which uses a normalization trick to better represent the distribution of neural network weights. LoRA adapters are trained in full precision (16-bit or 32-bit) on top of the quantized base. During training, the quantized weights are dequantized on the fly to the computation precision for each forward pass, gradients flow through the LoRA adapters only, and the base weights remain frozen and quantized. QLoRA reduces memory by roughly 4x compared to full fine-tuning — a 7B model needs roughly 8GB (vs 56GB for full), a 13B model needs roughly 16GB (vs 104GB), and a 65B model can fit on a single 48GB GPU (vs 520GB). Performance: QLoRA matches LoRA quality within 0.5-1% on most benchmarks, and LoRA matches full fine-tuning within 1-2% when using sufficient rank (r >= 16). This means QLoRA achieves roughly 95-99% of full fine-tuning quality at 5-10% of the memory cost. QLoRA made fine-tuning accessible to consumer hardware and is the dominant approach for open-source model adaptation.

DoRA (Weight-Decomposed Low-Rank Adaptation, Liu et al. 2024) improves upon LoRA by decomposing pre-trained weights into magnitude and direction components, then applying low-rank updates to the direction component. This is inspired by the observation that full fine-tuning primarily changes the direction of weight vectors rather than their magnitude. DoRA achieves better training stability and quality than LoRA at the same rank, and it converges faster (2-3x fewer steps). DoRA is implemented as a drop-in replacement for LoRA in most frameworks (HuggingFace PEFT). Adapters (Houlsby et al. 2019) are an earlier PEFT method that inserts small bottleneck layers (down-projection, ReLU, up-projection) into each Transformer layer. They are effective but add inference latency (the adapter is part of the forward pass and cannot be merged). Prefix Tuning (Li & Liang 2021) and Prompt Tuning (Lester et al. 2021) learn soft tokens (continuous embeddings) that are prepended to the input. These are even more parameter-efficient than LoRA (as few as 100-1000 learned tokens) but generally underperform LoRA on complex tasks.

Preference optimization aligns models with human values and preferences after instruction tuning. RLHF (Reinforcement Learning from Human Feedback, used by OpenAI for ChatGPT/GPT-4) is a three-stage process: (1) Supervised fine-tuning (SFT) on high-quality demonstrations. (2) Train a reward model on human preference data — humans compare pairs of model outputs and choose the better one; the reward model learns to predict the human preference. (3) Optimize the policy (the LLM) using Proximal Policy Optimization (PPO), where the reward model provides the reward signal and a KL penalty prevents the policy from drifting too far from the SFT model. RLHF is complex and unstable — it requires training and maintaining a separate reward model, PPO is sensitive to hyperparameters, and the KL penalty introduces a balancing act between reward maximization and output diversity.

DPO (Direct Preference Optimization, Rafailov et al. 2023) eliminates the reward model entirely. It directly optimizes the policy on preference pairs using a binary cross-entropy loss that implicitly represents the reward as a function of the policy's own likelihood ratio between preferred and dispreferred outputs. DPO is simpler, more stable, and requires less compute than RLHF (no reward model training, no PPO), and typically matches or outperforms RLHF in practice. The trade-off: DPO cannot easily incorporate non-pairwise feedback (ratings, multi-way comparisons) and cannot use explicit reward signals from external systems. ORPO (Odds Ratio Preference Optimization, Hong et al. 2024) combines SFT and preference optimization into a single stage by adding an odds ratio loss to the standard language modeling objective, further simplifying the pipeline. The model simultaneously learns to generate the target output (supervised) and to prefer it over rejected alternatives (preference). This eliminates the two-stage SFT-then-DPO pipeline, reducing training time by roughly 40%.

### Example

Fine-tuning LLaMA-2 7B on legal document summarization. Options and resource requirements: Full fine-tuning needs 56GB GPU memory (A100 80GB or 2x RTX 6000). LoRA (rank=8): 16GB memory (single RTX 3090/4090). QLoRA (4-bit NF4, rank=8): 8GB memory (single RTX 3080/4080). Training data: 5,000 legal case summaries from US federal courts. Training time: full - 12 hours on 4x A100; LoRA - 4 hours on single A100; QLoRA - 6 hours on single RTX 4090. Quality comparison on ROUGE-L: full fine-tune - 42.5; LoRA (r=8) - 41.8; LoRA (r=16) - 42.1; QLoRA (r=8) - 41.5; QLoRA (r=16) - 41.9. Conclusion: LoRA/QLoRA achieves 97-99% of full fine-tuning quality at 15-85% of the memory cost. The LoRA adapter checkpoint is 10MB vs 13GB for full fine-tuning. For production, use LoRA r=16 for the best quality-efficiency trade-off, or QLoRA for prototyping on consumer hardware.

Preference optimization example: After SFT on legal summaries, the model still occasionally hallucinates court names and dates. A preference dataset of 2,000 pairs is created (each pair: a good summary and one with hallucination). DPO training for 1 epoch with beta=0.1. The trained model shows 60% fewer hallucinations while maintaining ROUGE scores. The KL divergence from the SFT model is monitored — if it exceeds 0.5, early stopping prevents forgetting.

### Interview Questions

**Q: LoRA vs Full Fine-tuning — tradeoffs?**

A: Full fine-tuning updates all model parameters, offering the highest potential quality but requiring massive compute (56GB for 7B, 560GB+ for 70B), long training times, and producing large checkpoints (13GB for 7B). It risks catastrophic forgetting of general capabilities. LoRA updates only 0.1-0.5% of parameters via low-rank matrices injected into attention layers. Memory savings: roughly 3-4x less GPU memory (16GB vs 56GB for 7B). Training speed: 2-3x faster. Checkpoint size: ~10MB vs 13GB. Quality gap: LoRA typically achieves 97-99% of full fine-tuning quality at r >= 16. LoRA supports hot-swapping multiple adapters for different tasks without reloading the base model. Use full fine-tuning when: you need maximum quality, have large datasets (10K+), and have the compute budget. Use LoRA when: you need to fine-tune for multiple tasks, have limited compute, or are iterating rapidly on experiment design. In most production scenarios, LoRA with r=16-64 is the recommended starting point.

**Q: RLHF vs DPO — differences?**

A: RLHF (Reinforcement Learning from Human Feedback) is a three-stage process: (1) SFT on demonstrations. (2) Train a separate reward model on human preference comparisons (trained to predict which output a human would prefer). (3) Optimize the LLM using PPO against the reward model with a KL penalty. RLHF is complex, requires training two models (the reward model and the policy), PPO is hyperparameter-sensitive and unstable, and the reward model can be exploited (reward hacking). DPO (Direct Preference Optimization) eliminates the reward model: it directly optimizes the policy on preference pairs using a loss function that implicitly represents the reward as a ratio of policy probabilities. DPO is simpler (single training stage, no reward model), more stable (no PPO), and requires less compute (roughly 40% less total training time). DPO typically matches or slightly outperforms RLHF on standard benchmarks (AlpacaEval, MT-Bench). However, RLHF can incorporate additional reward signals (safety classifiers, task-specific metrics) that DPO cannot easily use. RLHF also has more research behind it for safety alignment. For most purposes, DPO is the recommended starting point due to its simplicity and stability.

**Q: What is catastrophic forgetting and how to prevent it?**

A: Catastrophic forgetting occurs when a model loses previously learned capabilities while being fine-tuned on a new task. For example, fine-tuning a general instruction-following model exclusively on legal summarization may cause it to lose translation, coding, or general QA abilities. This happens because weight updates for the new task overwrite weights that were important for old tasks. Prevention strategies: (1) Mix in general data — include 10-20% general domain examples during fine-tuning to maintain broad capabilities. (2) Elastic Weight Consolidation (EWC) — add a regularization term that penalizes changes to weights that were important for previous tasks (measured by the Fisher information matrix). (3) LoRA — by limiting the number of trainable parameters and freezing the base model, LoRA inherently reduces forgetting because the base model weights (containing general knowledge) remain untouched. (4) Multi-task fine-tuning — fine-tune on a mixture of tasks simultaneously rather than sequentially. (5) Replay buffers — periodically retrain on samples from previous tasks. (6) Early stopping — stop fine-tuning before forgetting sets in. (7) Low learning rates — use 1e-5 or lower to prevent large weight updates. In practice, LoRA with a diverse training mixture is the most effective and practical approach.

### Related Concepts
LLMs, RLHF, LoRA, Pre-training

---

## Evaluation & Hallucination in LLMs
**Definition:** Methods to assess LLM output quality and detect hallucinations: intrinsic metrics, LLM-as-judge, human evaluation, specialized RAG evaluation frameworks.

### Theory & Explanation

Evaluating LLM outputs is fundamentally challenging because the notion of correctness is often subjective and task-dependent. Unlike traditional machine learning where you can compute accuracy against a fixed label, LLM outputs are free-form text where multiple equally valid answers exist. This has led to a multi-layered evaluation ecosystem spanning automated metrics, LLM-based judges, human evaluation, and task-specific frameworks. The field is rapidly evolving because traditional NLG metrics developed for machine translation and summarization (BLEU, ROUGE, METEOR) are poorly suited for evaluating open-ended generative tasks. These metrics rely on n-gram overlap between the generated text and one or more reference texts, which cannot capture semantic equivalence. Two responses with identical meaning but different wording receive low scores — for example, "The patient has hypertension" vs "The patient's blood pressure is elevated" would score poorly on BLEU despite being semantically equivalent.

Traditional NLG metrics serve specific niches. BLEU (Bilingual Evaluation Understudy) measures n-gram precision — the proportion of n-grams in the generated text that appear in the reference text, with a brevity penalty to discourage short outputs. BLEU is most appropriate for machine translation where reference translations are available and lexical correctness matters. ROUGE (Recall-Oriented Understudy for Gisting Evaluation) measures n-gram recall — the proportion of n-grams in the reference text that appear in the generated text. ROUGE-L uses longest common subsequence to capture sentence-level structure. ROUGE is most appropriate for summarization where the goal is to cover the key information from the reference. METEOR extends these by incorporating synonym matching (using WordNet or paraphrase tables), stemming, and explicit word order penalties. METEOR correlates better with human judgment than BLEU or ROUGE alone. Perplexity is an intrinsic metric — the exponential of the negative log-likelihood of the text under the model. Lower perplexity means the model assigns higher probability to the text. Perplexity is useful for comparing models during pre-training but correlates poorly with task-specific quality.

LLM-as-Judge has emerged as the dominant evaluation method for open-ended tasks. The approach: use a strong LLM (GPT-4, Claude 3.5, Gemini 1.5 Pro) as an evaluator, providing it with the question, the model's response, and evaluation criteria. The LLM judge rates the response on a scale or compares two responses (pairwise comparison). G-Eval (Liu et al. 2023) chains evaluator prompts through multiple steps: first define evaluation criteria, then ask the LLM to generate a chain-of-thought evaluation, then output a score 1-5. LLM-as-Judge correlates well with human judgment (0.5-0.7 Spearman correlation, approaching human inter-annotator agreement) but has biases: position bias (preferring the first or second response in pairwise comparison), verbosity bias (preferring longer responses), self-enhancement bias (preferring responses from the same model family), and format bias (preferring structured outputs). Mitigations include: shuffling response order, using calibrated scoring rubrics, having multiple judges and averaging, and using fine-tuned evaluator models (PandaLM, Prometheus).

RAG evaluation requires specialized frameworks because RAG systems have two interacting components (retrieval and generation) and must be evaluated on both separately. The RAGAS (RAG Assessment) framework defines four core metrics computed without ground-truth answers (reference-free evaluation). (1) Context Precision: measures whether the retrieved chunks are relevant to the question. It uses the LLM to judge each retrieved chunk's relevance, then computes a precision score weighted by rank (relevant chunks appearing earlier get higher weight). (2) Context Recall: measures whether all necessary information to answer the question was retrieved. The LLM decomposes the ground-truth answer into claims and checks if each claim is supported by the retrieved context. (3) Faithfulness: measures whether the generated answer is consistent with the retrieved context. The LLM extracts claims from the generated answer and checks each against the context — claims not supported by context reduce faithfulness. (4) Answer Relevancy: measures whether the generated answer addresses the question. The LLM generates hypothetical questions from the answer and computes cosine similarity with the original question. RAGAS also provides synthetic test set generation — given a document corpus, it uses the LLM to generate questions and ground-truth answers covering different difficulty levels and question types.

Hallucination detection in LLM outputs is a critical safety concern, especially in high-stakes domains (healthcare, legal, finance). Hallucinations fall into two categories: intrinsic hallucinations (the output contradicts the provided context or known facts) and extrinsic hallucinations (the output adds information not verifiable from any source). Detection methods include: (1) SelfCheckGPT — generate multiple responses to the same prompt with high temperature, then check for consistency across responses. If the model consistently mentions the same facts, they are likely grounded; if a fact appears in only some responses, it may be hallucinated. SelfCheckGPT uses NLI (natural language inference) models to check entailment between sentences from different samples. (2) NLI-based detection — train or use a pre-trained NLI model (e.g., TrueTeacher, DeBERTa) to check if the generated text entails the provided context. Contradiction or neutral judgments indicate hallucination. (3) Semantic entropy (Kuhn et al. 2023) — cluster semantically equivalent meanings across multiple generations, then compute entropy over the clusters. High semantic entropy indicates uncertainty and likely hallucination. This is more principled than lexical entropy because multiple paraphrases of the same meaning should not contribute to uncertainty. (4) Lookahead verification — the LLM is prompted to verify its own output by checking each claim against the context, similar to self-consistency but in a single pass. (5) Retrieval-based verification — extract claims from the generated answer and verify each by retrieving supporting evidence from a trusted knowledge base. LangSmith and LangFuse provide tracing and evaluation platforms that instrument every step of the RAG pipeline — logging retrieved chunks, generation parameters, scores, and latency — enabling debugging of specific failure cases and monitoring of system drift over time.

Human evaluation remains the gold standard for output quality, especially for nuanced tasks like creative writing, tone appropriateness, and domain-specific accuracy. Common human evaluation protocols include: (1) Likert scale ratings (1-5) on specific criteria (relevance, fluency, completeness, safety). (2) Pairwise comparisons (A vs B) which are easier for humans to judge reliably than absolute scores. (3) Best-worst scaling — annotators select the best and worst from three or four options, producing more consistent rankings than pairwise. (4) Task-specific evaluation — for summarization, human judges check factuality, coverage, and conciseness. Human evaluation is expensive and slow (a typical study costs $5,000-50,000) but captures aspects no automated metric can. The practical approach for production systems is: use automated metrics and LLM-as-Judge for rapid iteration during development, use RAGAS for RAG system monitoring, and run periodic human evaluation studies to calibrate automated metrics and detect systematic issues like bias, toxicity, and subtle hallucination that automated methods miss.

### Example

RAG evaluation in practice: A customer support RAG system has a knowledge base of 1,000 product documentation pages. The evaluation dataset contains 200 queries collected from real customer support tickets, each with a ground-truth answer written by a human agent. For a sample query "What is your return policy for opened electronics?" the system retrieves chunk: "Our return policy allows returns within 30 days of purchase for unopened items. Opened electronics may be subject to a 15% restocking fee." The LLM generates: "You can return opened electronics within 30 days, but a 15% restocking fee applies." RAGAS evaluation: faithfulness = 0.95 (the answer is consistent with the context), answer_relevancy = 0.88 (the answer addresses the query), context_precision = 0.72 (one irrelevant chunk was also retrieved — about furniture returns), context_recall = 0.85 (the ground-truth answer mentions "receipt required" which the retrieved context did not cover). Compare with a hallucinated response: "You can return opened electronics for a full refund within 90 days." Faithfulness = 0.12 — detected immediately. The system also uses SelfCheckGPT: generating 5 responses with temperature 0.7, an NLI model checks consistency. The hallucinated claim "90-day return" appears in only 1 of 5 responses, triggering an alarm. The production monitoring dashboard shows a weekly faithfulness score trend: if it drops below 0.90, the team investigates by examining recent knowledge base updates, embedding model changes, or LLM provider updates.

### Interview Questions

**Q: How to evaluate RAG system output quality?**

A: RAG evaluation must assess both retrieval and generation quality independently. For retrieval: hit rate (does the top-k contain at least one relevant chunk), MRR (rank of first relevant result), nDCG (graded relevance scoring), and precision at k. For generation: RAGAS metrics — faithfulness (is the answer grounded in retrieved context), answer relevancy (does it address the question), context precision (are retrieved chunks relevant), and context recall (is all necessary information retrieved). Additionally, use LLM-as-Judge with GPT-4 scoring outputs on criteria like helpfulness, accuracy, and safety. Pairwise comparisons (A vs B) with LLM judges provide reliable rankings. For production monitoring, track: end-to-end latency (ideally <2s), user satisfaction (thumbs up/down), citation accuracy (are cited sources real), and fallback rate (how often does the system say it doesn't know). Periodically run human evaluation studies to calibrate automated metrics. The evaluation set should include edge cases: ambiguous queries, multi-part questions, out-of-scope requests, and previously unseen topics.

**Q: Methods to detect hallucinations in LLM outputs?**

A: Hallucination detection methods fall into several categories. (1) Consistency-based: SelfCheckGPT generates multiple responses and checks for contradictions between them using an NLI model. If the model consistently produces the same fact across temperature variations, it is likely grounded. (2) Entropy-based: semantic entropy clusters responses by meaning and computes entropy across clusters — high entropy (many different semantic clusters) indicates uncertainty. (3) Verification-based: extract atomic claims from the generated text and verify each against a trusted knowledge base or the provided context. Each claim is classified as supported, contradicted, or unverifiable. (4) Probability-based: low token probabilities, high perplexity, and high predictive entropy correlate with hallucination risk. (5) LLM-as-judge: ask a strong LLM evaluator to check the response for factual accuracy against the context, using chain-of-thought prompting for detailed verification. In production, a combination is recommended: self-consistency as a real-time signal (high computational cost but accurate), NLI-based verification for post-hoc monitoring, and adversarial evaluation during testing (deliberately provide contexts with contradictions and check if the model follows context or hallucinates).

**Q: BLEU vs ROUGE vs METEOR — differences and when to use?**

A: BLEU (Bilingual Evaluation Understudy) measures n-gram precision — the percentage of n-grams in the generated text that appear in the reference. It includes a brevity penalty to penalize short outputs. BLEU is best for machine translation where multiple valid translations share significant vocabulary. ROUGE (Recall-Oriented Understudy for Gisting Evaluation) measures n-gram recall — the percentage of reference n-grams that appear in the generated text. ROUGE-L uses the longest common subsequence (LCS) to measure sentence-level structure similarity. ROUGE is best for summarization where the goal is to cover all key information from the reference. METEOR extends both by: incorporating synonym matching (using WordNet, paraphrase tables), using stemming to match morphological variants, and adding a word order penalty. METEOR correlates better with human judgment than BLEU or ROUGE alone. Key differences: BLEU is precision-focused and penalizes extra words; ROUGE is recall-focused and penalizes missing words; METEOR balances both with linguistic knowledge. None of these capture semantic equivalence — two responses with identical meaning but different vocabulary will score poorly. For modern LLM evaluation, these metrics are largely superseded by embedding-based similarity (BERTScore, BLEURT) and LLM-as-Judge, which better capture semantic quality.

### Related Concepts
RAG, LLMs, Evaluation Metrics, RAGAS

---

## Additional LLM Concepts

**1. Foundation Model**
**Definition:** Large pre-trained model adaptable to many downstream tasks without task-specific architecture changes.
### Theory & Explanation
Foundation models are trained on broad data at massive scale (internet text, code, images, audio) via self-supervised learning. Unlike traditional task-specific models (e.g., a BERT fine-tuned only for sentiment analysis), foundation models serve as a general-purpose base. The key insight is scaling — as model size, data, and compute grow, emergent abilities appear: in-context learning, reasoning, instruction following. This paradigm shift from "train a model for every task" to "pre-train once, adapt for many tasks" has reshaped NLP.
### Example
GPT-4 can serve as the foundation for a chatbot, a code assistant (GitHub Copilot), a data analyst (code interpreter), or a creative writing tool — all without architectural changes, only different prompts and possibly fine-tuning. Claude and LLaMA follow the same paradigm.
### Interview Questions
**Q: How do foundation models differ from traditional task-specific models?**
A: Foundation models are trained once on diverse data at scale and adapted via prompting or fine-tuning for many tasks. Task-specific models require separate training and architecture for each task (e.g., one BERT for QA, another for NER). Foundation models exhibit emergent abilities that task-specific models lack.

**Q: What scaling laws govern foundation model performance?**
A: Kaplan et al. (2020) showed that model performance follows a power-law relationship with model size, dataset size, and compute. Chinchilla scaling laws (Hoffmann et al., 2022) refined this, showing most models are undertrained — for optimal performance, model parameters and training tokens should scale roughly equally (i.e., a 70B model should be trained on ~2T+ tokens).

---

**2. Instruction Tuning**
**Definition:** Fine-tuning a pre-trained LLM on (instruction, response) pairs to improve its ability to follow directions and perform diverse tasks.
### Theory & Explanation
Base pre-trained models are next-token predictors — they complete text but don't naturally follow instructions. Instruction tuning bridges this gap by training on supervised examples where each input is a natural language instruction and each output is the desired response. The dataset can range from 1K to 50K high-quality examples. FLAN (Fine-tuned LAnguage Net) showed that instruction tuning on a mixture of tasks (many NLP datasets reformatted as instructions) enables zero-shot generalization to unseen tasks. InstructGPT used RLHF after instruction tuning to align with human preferences. Key insight: instruction tuning teaches format and intent understanding, not task-specific knowledge.
### Example
A base GPT-3 might respond to "Summarize this article" by continuing the article text. An instruction-tuned version produces a concise summary. Example instruction data point: {"instruction": "Classify this sentiment", "input": "I loved the movie!", "output": "Positive"}.
### Interview Questions
**Q: How does instruction tuning differ from RLHF?**
A: Instruction tuning is supervised fine-tuning on (instruction, response) pairs — the model learns to imitate correct responses. RLHF (Reinforcement Learning from Human Feedback) goes further: train a reward model on human preferences, then optimize the LLM to maximize reward. Instruction tuning teaches format; RLHF teaches values and preferences. They are often used together: instruction tuning first, then RLHF.

**Q: Why is data quality more important than quantity for instruction tuning?**
A: Low-quality examples (wrong, vague, or hallucinated responses) teach the model bad patterns. A small set of diverse, high-quality, human-verified examples (e.g., 5K-10K) consistently outperforms large noisy datasets (100K+). The LIMA paper demonstrated this: training on just 1K carefully curated examples produced results competitive with 50K+ examples.

---

**3. Logit Bias**
**Definition:** Adding a bias value to the logits of specific tokens before sampling, increasing or decreasing their probability during generation.
### Theory & Explanation
During auto-regressive generation, the model outputs logits (un-normalized scores) for all tokens in the vocabulary. Softmax converts these to probabilities. Logit bias adds a constant value to specific token logits before softmax: positive bias increases the token's probability, negative bias decreases it. The bias range is typically -100 to +100. A bias of +100 nearly guarantees the token appears; -100 nearly eliminates it. Logit bias is applied per-token at each generation step, unlike temperature which scales all logits uniformly. Most LLM APIs expose this parameter (OpenAI: `logit_bias`, Anthropic: `logit_bias`).
### Example
To force JSON output, apply +100 bias to tokens like `{`, `}`, `"`, `:`, `,` and -100 bias to natural language tokens. To reduce harmful output, apply a small negative bias (-5 to -10) to tokens associated with violence or profanity. In OpenAI API: `{"logit_bias": {"42": -100, "": 10}}` maps token IDs to bias.
### Interview Questions
**Q: What's the difference between logit bias and temperature?**
A: Temperature scales all logits uniformly (dividing by T), flattening or sharpening the entire probability distribution. Logit bias targets specific token IDs individually. Temperature affects randomness; logit bias affects content constraints. They can be combined: use temperature for creativity, logit bias for format enforcement.

**Q: When would you use logit bias vs constrained decoding?**
A: Logit bias is simpler and works with any model API that exposes it but doesn't guarantee constraint satisfaction (a biased token can still be outvoted by many other tokens). Constrained decoding (e.g., guidance, LMQL, Outlines) enforces hard constraints using grammars or schemas, guaranteeing output structure. Use logit bias for soft preferences (discourage certain words); use constrained decoding for hard requirements (valid JSON, SQL, code with correct syntax).

---

**4. Beam Search**
**Definition:** A decoding strategy that maintains the top-b candidate sequences at each step, selecting the one with the highest overall probability at the end.
### Theory & Explanation
Greedy decoding chooses the highest-probability token at each step, which can miss better sequences — a locally suboptimal choice early on can lead to a globally worse sequence. Beam search keeps b candidates (the "beam"), expanding each by considering all possible next tokens, then retaining the top b candidates by cumulative log probability. At termination, the highest-scoring complete sequence is selected. Beam width b=2-10 is typical. Larger b improves quality but increases computation (O(b × vocabulary × sequence_length)). However, wider beams can reduce diversity and introduce repetition. Beam search is deterministic (same input → same output), making it suitable for tasks where quality and consistency matter over creativity.
### Example
For machine translation of "Je suis étudiant" to English with b=2: Step 1: ["I" (prob=0.6), "I'm" (prob=0.3)]. Step 2: expand both — ["I am" (0.42), "I'm a" (0.12), "I'm an" (0.09), "I have" (0.06)]. Keep top 2: ["I am", "I'm a"]. Step 3: continue until EOS. Final: "I am a student" beats greedy "I am student" because beam search saw "I am a" had higher joint probability.
### Interview Questions
**Q: What are the trade-offs of increasing beam width?**
A: Wider beams find higher probability sequences (better quality) but at quadratic computational cost. They also reduce output diversity (all b sequences converge to similar outputs) and can introduce repetition (the model favors high-frequency patterns). For creative tasks (storytelling, dialogue), beam width 1 (greedy) or sampling is preferred. For factual tasks (translation, summarization), beam width 3-5 is typical.

**Q: How does beam search compare with greedy decoding and sampling?**
A: Greedy is fastest but can miss optimal sequences. Beam search is slower but higher quality and deterministic. Sampling introduces randomness for diversity but can produce incoherent output. Hybrid approaches exist: beam search with temperature (sample within the beam), or diverse beam search (add diversity penalty to beam candidates).

---

**5. Decoding Strategies**
**Definition:** Algorithms for selecting tokens during auto-regressive generation, balancing quality, diversity, and speed.
### Theory & Explanation
All decoding strategies solve the same problem: given model probabilities for the next token, how to choose it. The spectrum ranges from deterministic to fully random. Greedy (argmax at each step): fast, low quality, repetitive. Beam search: best quality for factual tasks, slow. Top-k sampling: sample from the k most likely tokens (k=40-100), controlled randomness. Top-p (nucleus) sampling: sample from the smallest set of tokens whose cumulative probability exceeds p (p=0.9-0.95), adaptive — more tokens when model is uncertain, fewer when confident. Temperature: scale logits by 1/T before softmax. T → 0 approaches greedy, T → ∞ approaches uniform sampling. T < 1 sharpens distribution (more conservative), T > 1 flattens it (more creative). In practice, these are combined: temperature + top-p + top-k together control randomness at different levels.
### Example
A model predicting the next token after "The capital of France is": greedy picks "Paris" (prob=0.7). Top-k with k=3 samples from ["Paris" (0.7), "London" (0.1), "Berlin" (0.05)]. Top-p with p=0.9 includes tokens until cumulative prob ≥ 0.9: ["Paris" (0.7), "London" (0.1), "Berlin" (0.05), "Madrid" (0.03), "Rome" (0.02)]. Temperature T=2.0 flattens all probabilities, making unlikely tokens more plausible.
### Interview Questions
**Q: When should you use each decoding strategy?**
A: Greedy: baseline, speed-critical apps, deterministic needs. Beam search: factual generation (translation, summarization) where quality > speed. Top-k/top-p: creative generation (storytelling, dialogue, brainstorming) where diversity matters. Temperature: fine-grained creativity control — low (0.1-0.3) for code generation (correctness), medium (0.7-0.9) for creative writing, high (1.2-1.5) for idea generation.

**Q: Why is combining top-k and top-p recommended over using either alone?**
A: Top-k has a fixed cutoff — if k is too small, it truncates valid tokens when the distribution is flat; if too large, it includes unlikely tokens when the distribution is peaked. Top-p adapts to distribution shape but can include many low-probability tokens in flat distributions. Together: first filter to top-k tokens, then apply top-p on the filtered set — this gives both a hard cap on candidates and adaptive thresholding.

---

**6. Notable LLMs: Mistral, Falcon, Qwen**
**Definition:** Prominent open-weight LLM families with distinct architectural innovations and trade-offs.
### Theory & Explanation
Mistral AI released Mistral-7B (2023) which matched or outperformed LLaMA 2 13B using sliding window attention (each token attends to its local window of 4096 tokens, saving compute while maintaining long-range performance through stacked layers). The Mixtral 8x7B model uses mixture-of-experts (MoE) — 8 expert sub-networks with 2 active per token, achieving 46.7B total params but only 12.9B active, rivaling Llama 2 70B at fraction of the compute. Falcon (TII, UAE): Falcon-40B and 180B use multi-query attention (all heads share key/value projections, saving memory). Falcon-180B rivals PaLM-2 on benchmarks. Qwen (Alibaba): Qwen (Qianwen) series offers 128K+ native context length, strong multilingual performance (Chinese + English), and tool-use abilities. Qwen 2.5 72B competes with LLaMA 3 70B on many benchmarks.
### Example
Mistral-7B outperforms LLaMA 2 13B on most benchmarks while being 45% smaller. Falcon-180B achieves 68.5% on MMLU (near GPT-3.5 levels) while being fully open-weight. Qwen 2.5 72B scores 85+ on MMLU-Pro and handles 128K context natively.
### Interview Questions
**Q: What architectural innovations did Mistral introduce?**
A: Mistral's key innovation is sliding window attention — each layer's attention is limited to a fixed window (4096 tokens), but information propagates through layers (a token at position 1 in layer 1 can attend to position 4097 in layer 2). This gives O(L × w) instead of O(L²) attention cost. Mistral also uses MoE (Mixtral 8x7B) where different experts handle different token types, achieving better compute-to-quality ratio.

**Q: How do these models compare with LLaMA for production use?**
A: LLaMA has the strongest ecosystem (tools, quantization, community). Mistral offers the best performance-per-parameter ratio (especially mistral-small, mistral-medium APIs). Falcon is most open (true open weights, no restrictions for Falcon-180B). Qwen is best for multilingual scenarios (especially Chinese) and long-context applications (native 128K+). Choose based on: ecosystem need → LLaMA, cost efficiency → Mistral, regulatory compliance → Falcon, multilingual/long-context → Qwen.

---

## Additional RAG Concepts

**7. Indexing**
**Definition:** The pre-processing pipeline that converts raw documents into a searchable structure for retrieval.
### Theory & Explanation
Indexing in RAG involves: (1) Cleaning: remove boilerplate, HTML tags, irrelevant content, PII. (2) Chunking: split documents into manageable pieces (256-1024 tokens) with overlap (10-20%) to maintain context at boundaries. (3) Embedding: convert each chunk to a dense vector using an embedding model (text-embedding-3-small, BGE, E5). (4) Storing: store vectors in a vector database (Pinecone, Chroma, Weaviate, Qdrant) with an index structure (HNSW, IVF) for approximate nearest neighbor search. Most production RAG systems maintain two indexes: a vector index for semantic search and an inverted index (BM25) for keyword/lexical search, enabling hybrid retrieval. Index maintenance involves deciding between incremental updates (add new documents without full reindex) and full reindexing (rebuild entire index periodically, e.g., every 24 hours for news domains).
### Example
For a legal document: (1) Parse PDF, remove headers/footers/citations. (2) Chunk into 512-token segments with 50-token overlap. (3) Embed using text-embedding-3-small (1536 dimensions). (4) Store in Pinecone with HNSW index (efConstruction=128, M=16). (5) Also build BM25 index for hybrid retrieval — at query time, search both and fuse results.
### Interview Questions
**Q: What are the trade-offs between chunk sizes?**
A: Small chunks (128-256 tokens): more precise retrieval, relevant chunks are highly focused but may miss broader context and require more context window management at generation time. Large chunks (512-1024 tokens): richer context, better for complex reasoning but may include irrelevant content (diluting embedding quality) and exceed context windows. Optimal chunk size depends on content type — code benefits from larger chunks (function-level), while FAQ/QA benefits from smaller chunks (single Q&A). Overlapping chunks mitigates boundary issues.

**Q: How do you handle index updates for a production RAG system?**
A: Three strategies: (1) Incremental: add/update individual document embeddings without rebuilding — efficient but index quality degrades over time (HNSW graph becomes suboptimal). (2) Periodic full reindex: rebuild from scratch every N hours/days — maintains quality but is compute-heavy and causes downtime during reindex. (3) Shadow index: build new index in parallel, swap on completion — zero downtime but requires 2x storage. Most production systems use incremental for real-time ingestion + shadow reindex on a schedule.

---

**8. Similarity Search**
**Definition:** Finding the most similar vectors to a query vector using a distance or similarity metric.
### Theory & Explanation
The core operation in vector search: given a query embedding q and a collection of document embeddings D, find the top-k most similar. Three common metrics: (1) Cosine similarity: measures angle between vectors, range [-1, 1], invariant to vector magnitude. Formula: cos(q, d) = (q·d) / (||q|| ||d||). Most embedding models use cosine similarity. (2) Dot product: measures both angle and magnitude, q·d. When vectors are normalized (unit length), dot product = cosine similarity. (3) Euclidean (L2) distance: straight-line distance, sensitive to magnitude. For normalized embeddings, ranking by Euclidean distance is equivalent to ranking by cosine similarity (monotonic transformation). Pre-normalized embeddings are recommended for consistent behavior. Approximate Nearest Neighbor (ANN) algorithms (HNSW, IVF) trade 1-5% recall for 10-100x speed vs exact search.
### Example
Query: "How to train a neural network?" Embed to q (1536-dim vector). Compare against 1M document vectors. Cosine similarity scores: doc_A (chunk about backpropagation): 0.92, doc_B (chunk about gradient descent): 0.87, doc_C (chunk about Python lists): 0.12. Return top-3 docs A, B, C. Using HNSW (ef_search=256) finds same results in ~10ms vs ~500ms for exact search.
### Interview Questions
**Q: Which similarity metric should you use with different embedding models?**
A: Follow the embedding model's recommendation: OpenAI text-embedding-3 models are trained for cosine similarity. BGE models can use either cosine or dot product (they provide instructions). Cohere embed models prefer dot product. For normalized embeddings (most modern models), cosine, dot product, and Euclidean give equivalent rankings — the choice is implementation convenience. For unnormalized embeddings (rare), dot product captures both similarity and magnitude which may conflate relevance with verbosity.

**Q: What's the difference between exact search and ANN (approximate nearest neighbor)?**
A: Exact search (brute force) computes distance against every vector — guaranteed correct but O(N) per query, impractical at scale (>100K vectors). ANN uses index structures: HNSW (hierarchical navigable small world graphs, best recall/speed), IVF (inverted file index, good for very large collections), or product quantization (compression for memory efficiency). ANN trades perfect recall for speed — typical recall@10 is 95-99% with 10-100x speedup. Use ANN for latency-sensitive apps, exact search for small collections or where perfect recall is critical.

---

**9. Query Expansion**
**Definition:** Generating multiple variants of a user's query and searching all of them to improve retrieval recall.
### Theory & Explanation
A single user query may not contain the exact terms used in relevant documents. Query expansion addresses this by generating multiple reformulations: (1) Synonym expansion: replace key terms with synonyms (WordNet, thesaurus). (2) Back-translation: translate query to another language and back to generate paraphrases. (3) LLM-generated variations: ask an LLM to produce 3-5 alternative phrasings of the query. (4) Query decomposition: break complex queries into sub-queries. Each variant is searched independently, and results are merged (deduplicated, re-ranked). This increases recall (finding more relevant documents) at the cost of latency (multiples of single query time) and potential recall degradation (noise from poor expansions). Expansion is most effective for short, ambiguous queries and domain-specific terminology.
### Example
User query: "How do I fix memory leaks in Python?" → Expand to: (1) "Resolve memory leaks Python", (2) "Python memory management best practices", (3) "Garbage collection issues Python", (4) "Python memory leak debugging tools". Search all 4, collect unique results, rerank by relevance to original query. This finds documents about gc, weakref, and tracemalloc that the original query might miss.
### Interview Questions
**Q: When is query expansion not beneficial?**
A: Query expansion hurts when: (1) the original query is already precise and well-formed (long, specific queries don't benefit much). (2) The expansion introduces noise — poor paraphrases retrieve irrelevant documents. (3) Latency is critical — 5 queries vs 1 increases latency 3-5x even with parallel execution. (4) The domain has standardized terminology where synonyms are misleading (e.g., "Python" the language should not expand to "snake"). Use expansion selectively based on query characteristics.

**Q: Compare query expansion vs query transformation.**
A: Query expansion generates multiple search variants then merges results. Query transformation modifies the query before search (e.g., rewriting a question into a declarative statement, translating to English). Expansion increases breadth (more terms); transformation increases precision (better alignment with document structure). They are complementary: transform first to create a well-formed query, then expand for recall.

---

**10. Context Window Management**
**Definition:** Strategies for selecting and ordering retrieved chunks to fit within the LLM's context window while maximizing relevance and coherence.
### Theory & Explanation
LLMs have a fixed context window (4K-200K tokens depending on model). In RAG, retrieved chunks often exceed this limit. Context window management decides: (1) Which chunks to include (filtering, relevance thresholding). (2) How many chunks to include (budget allocation). (3) How to order them (relevance descending, original document order, or structured template). (4) What to do when chunks exceed the window. Strategies include: relevance-weighted truncation (drop lowest relevance chunks first), sliding window (include adjacent chunks for each retrieved chunk), summarization of older or less relevant context, and structured formatting ("Context:\n{doc1}\n\n{doc2}\n\nQuestion: {q}"). A common heuristic is: put the most relevant chunks first (LLMs pay more attention to early tokens), reserve 10-20% of the window for the instruction and question, and keep total context under 70% of the model's max window for safety margin.
### Example
Given: 15 retrieved chunks (avg 200 tokens each = 3000 tokens), LLM window 4096 tokens, instruction + question = 500 tokens. Budget: 4096 - 500 = 3596 remaining. Sort chunks by relevance score, take top 15 (3000 tokens, fits). If chunks were larger (500 each → 7500 tokens), take top 7 (3500 tokens), drop rest, or summarize additional chunks and append as compressed context.
### Interview Questions
**Q: What are the trade-offs of stuffing all retrieved chunks vs selective inclusion?**
A: Stuffing all chunks provides maximum information but risks: (1) exceeding context window (hard truncation of tail chunks). (2) Diluting attention — LLMs attend less to information in the middle (lost-in-the-middle phenomenon). (3) Increased latency and cost (more tokens processed). Selective inclusion improves focus and latency but may miss relevant information. Optimal approach: relevance-thresholded selection (discard docs below similarity 0.7) + top-k limit (max 10 chunks) + reorder by relevance.

**Q: How does the "lost in the middle" phenomenon affect RAG?**
A: Research (Liu et al., 2023) shows LLMs attend disproportionately to the beginning and end of long contexts, with information in the middle being "lost." For RAG, this means: place the most relevant chunks first, use separator tokens to demarcate chunks clearly, and if using many chunks, prioritize front-loaded ordering. Some systems use "recency bias" ordering (most relevant last) to exploit both the primacy effect (first) and recency effect (last).

---

**11. Sliding Window Retriever**
**Definition:** Retrieves a chunk, then includes adjacent chunks (before and after) to provide coherent context, maintaining narrative flow.
### Theory & Explanation
Standard chunking breaks documents into fixed-size pieces, but the optimal information might be split across chunk boundaries. A sliding window retriever addresses this: when chunk i is retrieved (based on similarity to the query), also include chunks i-w to i+w (where w is the window size, typically 2-4 on each side). This preserves the surrounding context — the sentences before (providing introduction/setup) and after (providing conclusion/elaboration). The window helps when: (1) The answer spans multiple chunks. (2) Key context is in a neighboring chunk. (3) The retrieved chunk starts or ends mid-sentence. The trade-off is increased token usage (window of 3 on each side adds 6 chunks) and potential inclusion of irrelevant content. The window can be static (always include neighbors) or dynamic (include neighbors only if they improve coherence, measured by embedding similarity or entity overlap).
### Example
Document chunked into 128-token chunks. Chunk 7 retrieved (relevance 0.91). With window size 2: include chunks 5, 6, 7, 8, 9. Chunk 5 contains the topic introduction ("Memory management involves..."), chunk 6 continues, chunk 7 (the retrieved one) is the core explanation, chunks 8-9 contain code examples. Without the window, the LLM sees only the core explanation without context or examples.
### Interview Questions
**Q: When would you use a large window vs small window?**
A: Large window (5-10 on each side): narrative/creative content (stories, articles, long explanations) where context is diffuse and critical for coherence. Small window (1-2): factual/QA content where answers are localized (encyclopedia entries, code snippets, API docs). No window (0): each chunk is self-contained (FAQ, standalone definitions). The optimal window is determined empirically — evaluate answer completeness with different window sizes on a validation set.

**Q: How does sliding window retrieval differ from overlap during chunking?**
A: Chunk overlap (typically 10-20%) ensures sentences aren't split mid-thought — adjacent chunks share content at boundaries. Sliding window retrieval includes complete neighboring chunks — it provides full surrounding context, not just boundary smoothing. These are complementary: use overlap during chunking for clean chunk boundaries, and sliding windows during retrieval for broader context when needed.

---

**12. Contextual Compression**
**Definition:** Compressing or trimming retrieved documents to extract only the parts relevant to the query, reducing token usage and removing irrelevant content.
### Theory & Explanation
Not all content in a retrieved chunk is relevant to the query — a chunk about "Python memory management" might contain a sentence about history of Python that is irrelevant to "How to fix memory leaks?" Contextual compression solves this by passing each retrieved document through a compression step: (1) LLMChainExtractor: uses an LLM to extract only query-relevant sentences from each document. (2) LLMChainFilter: returns the entire document or nothing (binary relevance filter). (3) Embedding-based filtering: recompute similarity between query and each sentence within the document, keep only high-scoring sentences. Compression can reduce token usage by 40-70% while maintaining or improving answer quality (by removing distracting content). The trade-off is additional latency (compression step adds LLM call per document) and potential loss of useful context (aggressive compression may remove indirectly relevant content).
### Example
Retrieved chunk: "Python was created by Guido van Rossum in 1991. Memory management in Python uses reference counting and a generational garbage collector. The garbage collector handles circular references by periodically running cycle detection. Python's design philosophy emphasizes readability." Query: "How does Python's garbage collector work?" → Compressed: "Memory management in Python uses reference counting and a generational garbage collector. The garbage collector handles circular references by periodically running cycle detection."
### Interview Questions
**Q: What are the latency/cost implications of contextual compression?**
A: Each compressed document requires an LLM call (or at least embedding computation), adding O(k × d) latency where k = number of documents and d = LLM latency per call. For 10 documents at ~500ms each, that's 5 seconds added. Mitigations: (1) Use a smaller/faster LLM for extraction (e.g., GPT-4o-mini vs GPT-4o). (2) Filter first (top-3 documents only) then compress. (3) Use embedding-based compression (faster, no LLM call). (4) Cache compressed versions. In practice, compression is most valuable when document quality varies (mixed relevance within chunks) and latency is not the primary constraint.

**Q: Compare LLMChainExtractor vs LLMChainFilter.**
A: LLMChainExtractor asks the LLM "extract relevant parts from this document given this query" — it produces a shorter, focused document. LLMChainFilter asks "is this document relevant?" — yes → keep entire document, no → discard. Extractor uses fewer tokens per document in generation (good for context window limits) but requires more LLM reasoning. Filter is faster (binary decision) but either includes or excludes entire documents. Extractor is better when documents are long with mixed relevance; filter is better when documents are short but many are irrelevant.

---

**13. Fusion Retrieval**
**Definition:** Retrieving from multiple heterogeneous sources (vector DB, web search, SQL, APIs) and fusing results into a unified, deduplicated, re-ranked list.
### Theory & Explanation
No single retrieval source is optimal for all queries. Vector search excels at semantic similarity but may miss exact matches or recent information. Web search provides current information but can be noisy. SQL queries provide structured, exact data for entities and relationships. API calls can access domain-specific knowledge bases. Fusion retrieval dispatches the query to all sources in parallel, then: (1) Merge: collect results from all sources into a single pool. (2) Normalize: convert scores from different sources to a common scale (min-max normalization, rank-based recoding). (3) Deduplicate: remove near-duplicate chunks (by content hash or embedding similarity >0.95). (4) Re-rank: score each result by relevance to the original query using a cross-encoder or LLM. Common fusion algorithms: Reciprocal Rank Fusion (RRF) — each document scores sum(1/(k + rank_per_source)), simple and effective — or weighted fusion where each source has a learned importance weight.
### Example
Query: "Latest React 19 release date and features" → Dispatch to: (1) Vector DB (internal docs, semantic match). (2) Web search via Brave/Tavily (latest news). (3) GitHub API (check React releases). (4) NPM API (version metadata). Results: DB returns React 18 docs (outdated), web returns "React 19 released March 2025", GitHub returns release notes for v19.0.0, NPM returns version 19.0.0. RRF fuses: GitHub doc rank 1 → score 0.33, web result rank 2 → 0.25, DB docs (low relevance) → rank 25. Final top results include release notes, announcement, and changelog.
### Interview Questions
**Q: How do you handle source reliability differences in fusion retrieval?**
A: Not all sources have equal reliability. Strategies: (1) Static source weighting — trusted sources (curated DB, official APIs) get higher fusion weights. (2) Source-specific score normalization — use different scaling per source based on historical reliability. (3) Post-retrieval verification — use an LLM to verify facts against multiple sources; if sources disagree, flag for human review. (4) Freshness weighting — recent sources get higher weight for time-sensitive queries. In practice, a tiered approach works: high-authority sources (documentation, official APIs) → mid (curated web) → low (unstructured web).

**Q: Compare fusion retrieval with hybrid search.**
A: Hybrid search combines sparse (BM25) and dense (embedding) retrieval from the same collection — different representations of the same data. Fusion retrieval combines different data sources — different data altogether. Hybrid search is one type of fusion (two sources: keyword and semantic indexes of the same corpus). Fusion retrieval generalizes to any number and type of sources. Hybrid search solves vocabulary mismatch; fusion retrieval solves coverage gaps.

---

**14. Modular RAG**
**Definition:** A composable architecture where RAG functionality is decomposed into independent, interchangeable modules (query transformation, routing, fusion, memory, prediction, task adaptation).
### Theory & Explanation
Traditional RAG follows a fixed pipeline: retrieve → augment → generate. Modular RAG recognizes that different tasks and domains require different RAG configurations. It decomposes the system into modules: Query Transformation (rewrite, expand, decompose query), Routing (direct query to appropriate retriever), Fusion (combine multiple retrieval results), Memory (maintain conversation history across turns), Predict (generate final answer with different strategies), and Task-Adaptive (optimize for specific tasks like summarization, QA, or code generation). Each module can be independently configured, replaced, or skipped. For example, a customer support RAG might use: query transformation → routing to FAQ DB or product docs → fusion of results → memory context → generation with citation. A code assistant RAG might skip query transformation and use direct code search → fusion with web results → generation with code formatting. Frameworks like LlamaIndex and LangChain support modular RAG natively.
### Example
A legal RAG system: (1) Query Transformation: rewrite legal question into search-friendly terms ("What are the damages for breach of contract?" → "breach of contract damages calculation methods"). (2) Routing: if query mentions a specific jurisdiction → route to jurisdiction-specific legal DB; otherwise → general legal corpus. (3) Retrieval: hybrid search (BM25 + embedding) on legal documents. (4) Fusion: combine with recent case law from web search. (5) Memory: maintain client-specific case context. (6) Predict: generate with citations to specific statutes.
### Interview Questions
**Q: What are the advantages of modular over monolithic RAG?**
A: Modular RAG offers: (1) Flexibility — swap or skip modules per task without rewriting the system. (2) Testability — each module can be independently validated. (3) Observability — clear logging at each module boundary makes debugging easier. (4) Reusability — modules can be shared across different applications. (5) Progressive enhancement — start with a simple pipeline and add modules as needed. The trade-off is increased system complexity and potential latency from module orchestration overhead.

**Q: How do you decide which modules a given RAG system needs?**
A: Start with the minimum viable RAG: retrieve → generate. Add modules based on failure modes: missing information → query expansion. Wrong information → hybrid retrieval + fusion. Incoherent across turns → memory module. Off-topic results → routing module. Hallucinations → verification/post-processing module. Add one module at a time and measure recall, precision, and latency impact. Most production RAG systems use 3-5 modules.

---

**15. FLARE (Forward-Looking Active Retrieval Augmented Generation)**
**Definition:** An active retrieval method where the model predicts upcoming tokens, uses them to formulate a retrieval query mid-generation, and retrieves relevant context when confidence is low.
### Theory & Explanation
Standard RAG retrieves once before generation — all context is fixed upfront. FLARE retrieves multiple times during generation. The process: (1) Generate a temporary next sentence or span. (2) If the model has low confidence (probability < threshold) on tokens containing factual claims (dates, names, numbers), treat these as a retrieval query. (3) Search the knowledge base with this predicted query. (4) Retrieve relevant context and regenerate the low-confidence tokens conditioned on the new context. (5) Continue generation, repeating the process. This active retrieval ensures the model has access to the right information at the right time, especially for multi-step reasoning or long-form generation where information needs change as the answer develops. FLARE improves factual accuracy by 10-20% over single-retrieval RAG on knowledge-intensive tasks but adds significant latency (multiple retrieval steps per generation).
### Example
Generating: "The Eiffel Tower was completed in [low confidence → predict '1889', retrieve 'Eiffel Tower completion date 1889'] 1889. It was built for the [predict 'World's Fair', retrieve '1889 Exposition Universelle'] World's Fair. The tower is [predict '330', retrieve 'Eiffel Tower height 330m'] 330 meters tall." Each prediction triggers a targeted retrieval for that specific fact.
### Interview Questions
**Q: When is FLARE preferable to standard RAG?**
A: FLARE excels when: (1) Answers require multiple factual claims from different parts of the knowledge base (e.g., a biography: birth date, education, career milestones). (2) The information needed changes as generation progresses (you can't predict all needs upfront). (3) The query is ambiguous and retrieval benefits from seeing partial answers first. Standard RAG is preferable when: (1) The answer is contained in a single document. (2) Latency is critical (FLARE is 3-5x slower). (3) The knowledge base is small and well-indexed.

**Q: How does FLARE handle low-confidence detection?**
A: FLARE monitors token-level probabilities during generation. It flags tokens where probability falls below a threshold (e.g., p < 0.5). But not all low-probability tokens need retrieval — the model focuses on "information tokens": named entities, dates, numbers, technical terms. It uses a lightweight classifier or regex to identify these token types. The flagged tokens form a retrieval query (e.g., extract entities from the low-confidence span and query the knowledge base). The threshold and entity detection rules are tuned per domain.

---

**16. RAG vs Alternatives Comparison Table**
**Definition:** Structured comparison of RAG, fine-tuning, and prompt engineering across multiple dimensions.
### Theory & Explanation
Each approach has distinct strengths: RAG excels at incorporating new/changing information and providing citations. Fine-tuning excels at customizing behavior, tone, and domain-specific patterns. Prompt engineering is fastest and cheapest for simple tasks but limited in complexity. The choice is not mutually exclusive — production systems often combine them: prompt engineering for task framing, RAG for external knowledge, fine-tuning for domain adaptation.

| Dimension | RAG | Fine-Tuning | Prompt Engineering |
|---|---|---|---|
| **Knowledge freshness** | Excellent (query live sources) | Poor (frozen at training time) | Depends on base model |
| **Training cost** | Low (no training needed) | High (GPU hours) | None |
| **Inference cost** | Medium (retrieval + generation) | Low (single model call) | Lowest |
| **Latency** | Higher (retrieval overhead) | Low | Lowest |
| **Factual accuracy** | High (grounded in retrieved docs) | Variable (model knowledge) | Variable |
| **Custom tone/behavior** | Limited (prompt guidance) | Excellent (learned patterns) | Moderate |
| **Data privacy** | Good (data stays in DB) | Risk (data in training set) | Good (no data storage) |
| **Handling new data** | Instant (add to index) | Requires retraining | N/A |
| **Long-term memory** | Excellent (index persists) | Good (learned patterns persist) | None |
| **Complex reasoning** | Good (augmented context) | Better (learned patterns) | Basic |
| **Explainability** | High (cite retrieved docs) | Low (black box) | Low |
| **Scalability** | Excellent (independent index) | Good (separate model per task) | Excellent |

### Interview Questions
**Q: When would you combine RAG + fine-tuning?**
A: Common patterns: (1) Fine-tune for domain language understanding + RAG for specific facts. Example: a medical LLM fine-tuned on clinical notes (learns medical terminology, note format) with RAG on latest drug interactions, treatment guidelines. (2) Fine-tune to improve instruction following and output formatting, RAG for content. (3) Fine-tune a smaller model on task-specific data, use RAG to supplement knowledge — this achieves good quality with lower cost than a large model + RAG alone.

**Q: What are the limitations of relying solely on prompt engineering?**
A: Prompt engineering is limited by: (1) Context window — can't provide enough information for complex tasks. (2) Consistency — prompt wording changes affect output. (3) Task complexity — can't teach the model new patterns the base model doesn't understand (e.g., a specific output schema requiring structured reasoning). (4) Memory — no long-term memory between sessions without retrieval augmentation. (5) Reliability — prompt injections and jailbreaks are easier to exploit. Prompt engineering is best for simple, well-defined tasks; RAG and fine-tuning extend its capabilities.

---

## Additional Prompt Engineering

**17. Role Prompting**
**Definition:** Assigning a specific persona or role to the LLM in the system prompt to set context, constraints, and behavioral expectations.
### Theory & Explanation
Role prompting frames the LLM's behavior by defining who it is, what expertise it has, and how it should respond. This activates domain-specific knowledge the model learned during training — a model prompted as "expert cardiologist" will surface medical knowledge more reliably than a generic "assistant." The role provides implicit guardrails: an "expert lawyer" knows to cite precedents and use precise legal language; a "creative writing coach" knows to focus on narrative techniques. Effective role prompts include: the role definition, the context/scenario, specific output guidelines, and constraints/tone. Role prompting is most effective for domain-specific tasks (medical, legal, technical) where the model has training data in that domain. It's less effective for novel domains (emerging fields not in training data) where the model cannot actually "be" an expert in something it wasn't trained on.
### Example
System: "You are an expert Python engineer with 15 years of experience. You prioritize readable, well-documented, type-annotated code. You explain performance implications and potential pitfalls." User: "Write a function to merge two sorted lists." → The model produces a type-annotated, documented function with time/space complexity analysis. Without role prompting, it might produce a generic unannotated solution.
### Interview Questions
**Q: How do you measure if role prompting improves output quality?**
A: Compare outputs with and without role prompting on representative test examples using: domain expert human evaluation (blinded), automated metrics (ROUGE-L, BERTScore for reference-based tasks), or LLM-as-judge evaluation. Track task-specific metrics: relevance, completeness, and adherence to domain conventions. A/B test in production on task success rate and user satisfaction.

**Q: Can role prompting backfire?**
A: Yes — an overly specific or mismatched role can constrain the model: (1) The model might refuse to answer outside its role even when the answer is simple ("As a poet, I cannot help with mathematics"). (2) The model might exaggerate the role and produce verbose, stylistically rigid responses. (3) The role can create false confidence (an "expert" role may reduce self-correction). Solution: balance role specificity with flexibility: "You are an expert [role] but you can help with any question."

---

**18. APE (Automatic Prompt Engineer)**
**Definition:** An automated method where an LLM generates, evaluates, and iteratively refines prompts to optimize performance on a given task.
### Theory & Explanation
APE (Zhou et al., 2022) treats prompt engineering as a search problem. The process: (1) Generate candidate prompts: use an LLM to produce many prompt variants given a task description (e.g., "Generate 20 prompts for sentiment classification"). (2) Evaluate candidates: run each prompt on a held-out validation set with labeled examples, measuring performance (accuracy, F1, or task-specific metric). (3) Select best: pick the top-performing prompt. (4) Iterate: use the best prompt to seed generation of refined candidates, repeating for several rounds. APE can discover prompts that outperform human-written ones, often with surprising formulations humans wouldn't try. Variants include: instruction-focused APE (generate instruction only), few-shot APE (generate both instruction and examples), and chain-of-thought APE (generate reasoning steps). APE is compute-intensive (requires many LLM calls for evaluation) but can be fully automated.
### Example
Task: Classify movie reviews as positive/negative. APE generates candidates: (1) "Classify the sentiment of this review." (Accuracy: 85%). (2) "You are a film critic. Is this review positive or negative?" (87%). (3) "Identify whether the reviewer liked or disliked the movie. Reply with 'Positive' or 'Negative' only." (91%). After 3 rounds of refinement, the best prompt: "Determine the sentiment expressed in the following movie review. Consider the overall tone, specific praise or criticism, and the reviewer's recommendation. Output only 'Positive' or 'Negative'." (Accuracy: 94% — vs human baseline 91%).
### Interview Questions
**Q: What are the limitations of APE?**
A: (1) Computationally expensive — evaluating 50 prompts on 100 examples requires 5000 LLM calls. (2) Metric-dependent — quality depends on having a good evaluation metric; for subjective tasks (creativity, style), metrics are hard to define. (3) Overfitting — prompts optimized on a small validation set may not generalize. (4) Search space — the best prompt may be outside the LLM's generation capability for prompts (the meta-prompt limits creativity). (5) Diminishing returns — improvement typically saturates after 2-3 rounds.

**Q: How does APE compare with DSPy?**
A: APE optimizes prompts only — it searches the natural language instruction space. DSPy (Declarative Self-improving Python) is a broader framework that optimizes the entire pipeline: prompts, few-shot examples, tool calls, and retrieval parameters. DSPy treats pipeline steps as "modules" and uses Bayesian optimization or random search to find optimal configurations. APE is simpler and task-focused; DSPy is more powerful for complex multi-step pipelines but has a steeper learning curve.

---

**19. Prompt Chaining**
**Definition:** Breaking a complex task into a sequence of simpler subtasks, where the output of each prompt becomes the input of the next.
### Theory & Explanation
Complex tasks often exceed what a single prompt can reliably handle. Prompt chaining decomposes the task into steps, each handled by a separate prompt (possibly with different instructions, contexts, and even different models). Each step's output feeds into the next. Advantages: (1) Modularity — each step is independently testable and optimizable. (2) Transparency — the chain's intermediate outputs provide insight into reasoning. (3) Specialization — different steps can use different models (a cheap model for extraction, a powerful model for reasoning). (4) Context management — each prompt can have focused context without exceeding token limits. Architectures: sequential chains (A → B → C), conditional chains (A → if X then B else C), and parallel chains (A and B in parallel → merge → C). The trade-off is increased latency (multiple LLM calls) and error propagation (a mistake early in the chain compounds). LLM-based evaluation can be inserted between steps for quality control.
### Example
Document summarization chain: Step 1: "Extract all key entities and their relationships from this document." → Entities list. Step 2: "Generate a one-paragraph summary focusing on the extracted entities." → Draft summary. Step 3: "Check if the draft summary covers all entities from step 1. If any entity is missing, expand the summary." → Final summary. Each step has a clear objective and limited context.
### Interview Questions
**Q: How do you decide the optimal granularity for chain steps?**
A: Each step should be a meaningful, well-defined subtask with a single clear output. Signs of too fine-grained: overhead dominates (latency of 10+ LLM calls for a 2-step task). Signs of too coarse: step prompts are complex and unreliable — decompose further. A good heuristic: each step should take 1-2 paragraphs of instructions and produce 1-2 paragraphs of output. Start with a 2-3 step decomposition and add steps only when a step's output quality is insufficient.

**Q: How does prompt chaining compare to multi-step agents?**
A: Prompt chaining is a hard-coded sequence with fixed steps. Multi-step agents use an LLM to dynamically decide the next step, tool, and when to stop. Chaining is more predictable and debuggable; agents are more flexible but less reliable. Use chaining for well-understood, repeatable workflows (data processing pipelines, report generation). Use agents for exploratory or variable workflows (web research, customer support triage).

---

**20. Common Prompt Templates**
**Definition:** Ready-made, reusable prompt patterns optimized for common NLP tasks, each with a standard structure and best practices.
### Theory & Explanation
Instead of writing prompts from scratch, common templates provide battle-tested formats for frequent tasks. Each template includes: system instruction, task description, input format specification, output format specification, and examples (few-shot). The templates serve as starting points that can be customized per use case. Common templates include: QA Template (context + question → answer), Summarization Template (document → bullet points or paragraph summary), Extraction Template (document + schema → structured output), Classification Template (text + categories → category label), Code Generation Template (requirements + language → code), Data Transformation Template (input format → output format, e.g., JSON to CSV). Effective templates encode specific heuristics: answer format constraints (JSON schema, markdown structure), length constraints (2-3 sentences, 100 words max), quality instructions (cite sources, explain reasoning), and edge case handling (how to handle insufficient information, conflicting sources).
### Example
**Extraction Template:**
```
System: You are a data extraction expert. Extract structured information from the provided text according to the specified schema. Return valid JSON only.
User: Text: {input_text}
Schema: {json_schema}
Extract the data and return as JSON.
```
**QA Template:**
```
System: Answer the question based on the context below. If the context doesn't contain sufficient information, say "I don't have enough information to answer this." Do not make up facts.
Context: {retrieved_chunks}
User: {question}
Assistant:
```
### Interview Questions
**Q: What makes a good prompt template versus a bad one?**
A: Good templates are: (1) Explicit about input/output format (no ambiguity). (2) Include examples (even 1-2 help dramatically). (3) Handle edge cases (what to do with missing information). (4) Use separators clearly (### Context: / ### Question: / ### Answer:). (5) Avoid negative instructions (don't say "Don't use bullet points" — say "Use numbered list"). Bad templates: (1) Overly vague. (2) No format specification. (3) Contradictory instructions. (4) Too long (exceed activation/attention span). (5) Role mismatches with task.

**Q: How do you version and manage prompt templates in production?**
A: Treat prompts as code: (1) Store in version control (Git) with semantic versioning. (2) Each template has a unique name and version tag (e.g., "qa-template-v3"). (3) Maintain a changelog documenting what changed and why. (4) Run regression tests when updating template: compare outputs on a test set before/after. (5) Use feature flags to gradually roll out new templates (10% → 50% → 100% traffic). (6) Log which template version was used for each request for debugging. Tools like LangSmith, Weights & Biases Prompts, or simple YAML files work well.

---

## Additional Agent Concepts

**21. Reflection**
**Definition:** An agent evaluating its own output and iterating to improve it through self-critique, error detection, and plan revision.
### Theory & Explanation
Reflection gives agents a feedback loop: generate output → evaluate output → revise. This mirrors the human process of drafting and editing. The agent can evaluate against: correctness (does the output satisfy the task?), completeness (are there gaps?), coherence (is the reasoning logical?), constraints (does it follow format rules?). Reflection can be triggered: after each action (fine-grained), after completing a plan (checkpoint-based), or when an error or low-confidence indicator appears (on-demand). The evaluation can use: the same LLM (self-reflection), a different, more powerful model, or external tools (test runners, validators, linters). Reflection significantly improves agent performance — agents with reflection achieve 20-40% higher task completion rates on complex multi-step tasks. However, reflection adds latency (2x-3x more LLM calls) and can over-correct (make correct outputs worse by second-guessing).
### Example
Code agent generates a Python function to sort a list → reflects: "Does this handle empty lists? Edge case: what if input is None? Check time complexity — O(n²) from bubble sort. I should use Timsort instead." → Revises function with better implementation, type hints, and None handling. Then reflects again: "Test with input [3, 1, 4] → output [1, 3, 4]. Correct. Ready."
### Interview Questions
**Q: What are the failure modes of reflection?**
A: (1) Over-correction: correct output gets "corrected" to wrong output. Mitigation: limit reflection rounds (max 2-3). (2) Self-reinforcing errors: the model confirms its own mistake because it can't detect the error. Mitigation: use a different evaluator model. (3) Endless loops: agent keeps refining without convergence. Mitigation: max iteration limit, improvement threshold (stop if improvement < 5%). (4) Confirmation bias: the reflection prompt leads the model to approve its own output. Mitigation: neutral reflection prompts.

**Q: How do you implement reflection in practice?**
A: Simple implementation: after each action, call the LLM with: "Given the original task: {task}, your previous output: {output}, evaluate the output. Identify any errors, omissions, or improvements. Then provide a revised version." Wrap in a loop with max_iterations=3. In LangGraph, reflection is a conditional edge: after generation → evaluation node → if "needs improvement" → loop back to generation. Track improvement metrics to detect diminishing returns.

---

**22. Self-Evaluation**
**Definition:** An agent assigning a score or confidence rating to its own output, used to decide whether to stop, retry, switch strategies, or request human intervention.
### Theory & Explanation
Self-evaluation differs from reflection: reflection produces revised output; evaluation produces a score/decision. The model assesses: confidence in the answer, completeness against task requirements, alignment with constraints, and uncertainty about specific parts. Self-evaluation enables the agent to: (1) Stop early if sufficiently confident (saves compute). (2) Retry if confidence is low (improves quality). (3) Switch to a more capable model for hard cases. (4) Ask the human for clarification or approval. Self-evaluation can be: explicit (the model outputs a confidence score or explanation) or implicit (track token-level probabilities, entropy, or consistency across multiple generations). Calibration is key — a well-calibrated model knows when it's correct and when it's guessing. Most LLMs are overconfident — they assign high confidence even to wrong answers — so calibration techniques (temperature sampling, self-consistency) are critical.
### Example
Agent asked "What is the capital of France?" → Generates "Paris" with probability 0.92 → Self-evaluation: "Confidence: high. The answer is known and unambiguous." → Stop and return. Agent asked "What was the GDP of Argentina in 2023?" → Generates "Argentina's GDP in 2023 was approximately $640 billion" with probability 0.45 → Self-evaluation: "Confidence: medium. The specific number might not be current. I should verify with a web search." → Triggers retrieval before finalizing.
### Interview Questions
**Q: How do you calibrate an LLM's self-evaluation?**
A: Calibration involves aligning predicted confidence with actual accuracy: (1) Collect a calibration set of N examples with known ground truth. (2) For each example, have the model generate an answer + confidence score. (3) Bin examples by confidence (e.g., 0-0.2, 0.2-0.4, etc.) and compute accuracy per bin. (4) If accuracy < confidence in a bin (e.g., 90% confidence but 70% accuracy), the model is overconfident — apply Platt scaling or temperature scaling to adjust. (5) Iterate until calibration curve is diagonal. Post-hoc calibration (adjusting after generation) is more reliable than expecting the model to self-calibrate.

**Q: How does self-evaluation enable selective delegation?**
A: Selective delegation uses self-evaluation to route tasks: if self-evaluation confidence > threshold (e.g., 0.8), use a small cheap model directly. If between 0.4-0.8, use a larger model. If < 0.4, use RAG + large model, or escalate to human. This cascade optimizes cost-quality trade-off: 60-80% of queries handled by the cheap model, 15-30% by the expensive model, 5-10% escalated to human. The thresholds are tuned based on task criticality.

---

**23. Router**
**Definition:** A component that classifies an incoming query and routes it to the appropriate agent, tool, or processing pipeline.
### Theory & Explanation
Routers solve the problem of scale and specialization — instead of one giant agent that can do everything (expensive, error-prone), a router classifies the query and dispatches to specialized sub-agents. The router typically performs: intent classification (what does the user want?), entity extraction (what/who does the query refer to?), and urgency/priority assessment. Routing can be: (1) LLM-based: "Classify this query into one of: [categories]" — most flexible, higher latency. (2) Embedding-based: embed query, find nearest category centroid — faster, less flexible. (3) Rule-based: keyword/regex matching — fastest, brittle. Routers are the primary mechanism for reducing a monolithic system into manageable, specialized components. In production, routers handle load balancing, A/B testing (route to different system versions), and graceful degradation (route to fallback if primary system fails). Multi-level routing is common: first router (domain level: "tech support" vs "sales"), second router (sub-domain: "billing" vs "technical issue" vs "account management").
### Example
Customer support system: Router receives "I can't log in to my account." → Classifies as "Authentication Issue" → Routes to Password Reset Agent. Router receives "What's the price of the premium plan?" → Classifies as "Pricing Question" → Routes to Sales Info Agent (which retrieves latest pricing from DB). Router receives "You guys are terrible, I want a refund" → Classifies as "Refund/Churn" → Routes to Retention Specialist Agent (with high urgency flag).
### Interview Questions
**Q: How do you train a router?**
A: Three approaches: (1) LLM-based: craft a system prompt with clear category definitions and examples. Zero-shot works well for 5-15 categories. Use few-shot for rare categories. (2) Embedding + classifier: collect labeled examples (query → category), embed queries with sentence transformer, train a lightweight classifier (logistic regression, SVM) on the embeddings. (3) Fine-tuned classifier: fine-tune a small BERT-style model on labeled queries. LLM-based is easiest to start; embedding-based is best for latency-critical systems; fine-tuned is best for high accuracy with many fine-grained categories. In production, start with LLM and move to embedding/classifier as query volume grows.

**Q: What happens when the router is uncertain?**
A: Strategies: (1) Top-2 routing — run the top-2 most likely agents and fuse or compare results. (2) Confidence threshold — if max confidence < 0.6, use a general-purpose fallback agent or ask the user for clarification. (3) Explicit disambiguation — router says "Did you mean [option A] or [option B]?" (4) Escalate to human — for highly uncertain or high-stakes queries. The fallback behavior should be designed to gracefully handle uncertainty rather than making a wrong hard routing decision.

---

**24. Autonomous vs Semi-autonomous Agents**
**Definition:** Autonomous agents operate without human intervention; semi-autonomous agents pause for human confirmation on key decisions.
### Theory & Explanation
The autonomy spectrum ranges from fully autonomous (AI plans, executes, and completes tasks independently) to fully human-operated (AI only provides suggestions). Semi-autonomous agents sit in the middle: they can perform routine sub-tasks independently but require human approval for high-stakes actions (sending emails, making purchases, posting content, deleting data). The decision boundary is determined by: (1) Risk: irreversible actions (deleting data, spending money) need approval; reversible ones (searching, drafting) can be autonomous. (2) Cost: expensive operations (buying cloud resources) need approval; cheap ones (API calls) don't. (3) Compliance: regulated actions (medical advice, legal decisions) require human oversight. (4) User preference: some users want more control, others want automation. Semi-autonomous agents typically implement: draft mode (agent acts, asks "Should I proceed?"), approval queues (proposed actions displayed for batch approval), and confidence thresholds (agent proceeds autonomously only when confidence > threshold).
### Example
Autonomous email assistant: reads email, categorizes, auto-replies to routine messages (scheduling, confirmations), flags complex emails for human review. Semi-autonomous email assistant: drafts replies to all emails, presents drafts to user for review and approval before sending. For the semi-autonomous version, the user can: approve (send), edit then approve, reject and write from scratch, or set rules (auto-approve emails from specific senders).
### Interview Questions
**Q: How do you decide the autonomy level for a given agent?**
A: Assess each action the agent can take on two dimensions: (1) Reversibility: is the action undoable? (Deleting a file → undoable. Searching → reversible.) (2) Impact: what's the potential negative consequence? (Low: minor inconvenience. High: financial loss, compliance violation, user trust damage.) Rule: high-impact irreversible actions require always-confirm. Low-impact reversible actions can be autonomous. Actions in the middle use confidence thresholds or user preference settings.

**Q: What user experience patterns work for semi-autonomous agents?**
A: (1) Notification + quick action: "I've drafted a reply. [Approve] [Edit] [Reject]" — shown inline. (2) Approval dashboard: list of pending actions with approve/reject/edit for each. (3) Gradual autonomy: start with maximum human oversight, reduce based on user's trust patterns (if user approves 10 emails from the same sender without changes, start auto-approving). (4) Undo: even for autonomous actions, provide a brief undo window (e.g., Gmail undo send). (5) Audit log: always show what the agent did, even if autonomous.

---

**25. Agent Architecture**
**Definition:** Common structural patterns for organizing LLM agents, defining how agents communicate, delegate, and collaborate.
### Theory & Explanation
Agent architectures solve coordination: when you have multiple capabilities, how do you organize them? Four dominant patterns: (1) Single-agent: one LLM + tools. Simplest, good for well-scoped tasks. The LLM decides tool usage, call ordering, and final output. (2) Supervisor/Worker: an orchestrator (supervisor) delegates subtasks to specialized worker agents, collects results, and composes the final output. Workers are domain-specific (code generator, web searcher, data analyzer). The supervisor handles planning and coordination. (3) Multi-agent: multiple agents with different roles collaborate without a single supervisor. Agents communicate via shared messages, each contributing from their expertise. Requires coordination protocols to avoid conflicts. (4) Hierarchical: multi-level decomposition — strategic agents set goals, tactical agents plan approaches, operational agents execute. Each level has different scope and authority. The choice depends on: task complexity (single vs multi-step), domain breadth (single vs multiple domains), need for specialization, and coordination complexity.
### Example
**Supervisor/Worker** for report generation: Supervisor receives "Research and write a report on AI regulation." → Supervisor splits into: Research Worker (search for articles, papers), Analysis Worker (extract key themes), Writing Worker (compose report sections), Citation Worker (format citations). Supervisor collects outputs, composes final report, checks quality.
### Interview Questions
**Q: When should you use multi-agent over supervisor/worker?**
A: Multi-agent is better when: (1) No natural hierarchy — agents have equal status (debate, discussion, collaborative problem-solving). (2) Emergent behavior is desired — interaction between agents generates novel solutions. (3) Resilience — no single point of failure. Supervisor/worker is better when: (1) Clear task decomposition is possible. (2) Centralized coordination is needed (prevent conflicts). (3) Simpler debugging and logging. In practice, supervisor/worker is more common because it's easier to reason about and control.

**Q: What are the failure modes of multi-agent systems?**
A: (1) Coordination overhead: agents spend more time communicating than doing useful work. (2) Conflicts: agents give contradictory instructions or overwrite each other's outputs. (3) Deadlocks: agent A waits for B, B waits for A. (4) Echo chamber: agents reinforce each other's incorrect assumptions. (5) Cost explosion: N agents × multiple rounds = high token usage. Solutions: timeouts, conflict resolution protocols, termination conditions, and shared memory for grounding.

---

**26. LangChain**
**Definition:** A popular open-source framework for building LLM-powered applications, providing abstractions for agents, chains, tools, memory, and retrieval.
### Theory & Explanation
LangChain (2022, Harrison Chase) standardizes the components needed for LLM applications: Models (abstraction layer over different LLM providers), Prompts (templates, few-shot management), Chains (composable sequences of calls), Agents (LLM-driven tool usage with ReAct or Plan-and-Execute patterns), Tools (wrappers for APIs, search, code execution, databases), Memory (conversation history, entity summaries, vector store retrieval), and Retrieval (document loaders, text splitters, embedding, vector stores). LangGraph extends LangChain with state-graph architecture: nodes (processing steps) and edges (conditional transitions between nodes) that enable complex, cyclic workflows (multi-agent loops, reflection, human-in-the-loop). LangSmith provides observability: tracing, evaluation, and debugging. LangChain is framework-agnostic (works with any LLM) but introduces framework-specific abstractions that can leak abstraction and make debugging harder.
### Example
Building a RAG agent in LangChain: `vectorstore = Chroma.from_documents(docs, embeddings)` → `retriever = vectorstore.as_retriever()` → `chain = RetrievalQA.from_chain_type(llm=llm, retriever=retriever)` → `chain.invoke("What is RAG?")`. Adding tools: `tools = [TavilySearchResults(), PythonREPL()]` → `agent = create_react_agent(llm, tools)` → execute.
### Interview Questions
**Q: What are the pros and cons of using LangChain vs building from scratch?**
A: Pros: rapid prototyping, built-in components for common patterns (RAG, agents, chains), provider agnosticism, community extensions, observability via LangSmith. Cons: abstraction overhead (complex stack traces, hard to debug), framework lock-in, version instability (breaking changes between minor versions), "black box" feeling (hard to know exactly what's happening under the hood). Recommendation: use LangChain for prototyping and standard patterns; consider building on plain LLM APIs for production when you need full control over prompt construction, error handling, and latency.

**Q: How does LangGraph differ from LangChain?**
A: LangChain is linear/compositional — chains execute in sequence. LangGraph is graph-based — nodes execute in a directed graph with cycles, conditionals, and parallel execution. LangGraph enables: loops (reflection), branching (parallel tool calls), state machines (human-in-the-loop), and multi-agent orchestration. Think of LangChain as "deterministic pipeline" and LangGraph as "stateful workflow." LangGraph subsumes LangChain — you can use LangChain components within a LangGraph.

---

**27. Semantic Kernel**
**Definition:** Microsoft's lightweight SDK for AI orchestration, providing plugins, planners, and memory for building LLM applications in .NET and Python.
### Theory & Explanation
Semantic Kernel (SK) is designed for enterprise integration — it emphasizes type safety, native code integration, and enterprise patterns. Core concepts: (1) Kernel: central orchestrator that connects LLMs, plugins, and memory. (2) Plugins: reusable, typed functions (native code or semantic prompts) that the AI can call. Plugins have explicit schemas (input/output types) for safety. (3) Planner: automatically sequences plugin calls to fulfill a user request. SK's planner uses function composition and can handle multi-step plans. (4) Memory: semantic memory (vector storage for facts), text memory (text-based retrieval). SK is .NET-native (C#/F#) with Python support — it integrates with Azure OpenAI, OpenAI, Hugging Face, and local models. Compared to LangChain, SK is more opinionated about structure (types, schemas) and enterprise security, but has a smaller community and fewer integrations.
### Example
C# code: `var kernel = Kernel.CreateBuilder().AddAzureOpenAIChatCompletion(deploymentName, endpoint, apiKey).Build(); kernel.ImportPluginFromType<EmailPlugin>(); var result = await kernel.InvokePromptAsync("Send an email to {{$recipient}} about {{$topic}}", new() { ["recipient"] = "user@example.com", ["topic"] = "meeting reminder" });` The planner automatically calls the EmailPlugin's SendEmail function with the right parameters.
### Interview Questions
**Q: How does Semantic Kernel's planner compare to LangChain agents?**
A: SK's planner (FunctionCallingStepwisePlanner) uses a sequential planning approach — it generates a step-by-step plan as a sequence of function calls, then executes them. LangChain agents use ReAct (Reasoning + Acting loop) — interleave reasoning and tool calls dynamically. SK's planner is more structured (the plan is generated upfront); LangChain's agents are more flexible (plan can change based on intermediate results). SK's planner is better for well-defined, multi-step workflows; LangChain agents are better for exploratory tasks.

**Q: When would you choose Semantic Kernel over LangChain?**
A: Choose Semantic Kernel when: (1) Your tech stack is .NET/C# (SK is the natural choice). (2) Enterprise security and type safety are priorities (SK's typed plugins prevent malformed calls). (3) You want tight Azure OpenAI integration. (4) You prefer structured planning over dynamic agent behavior. Choose LangChain when: (1) Your stack is Python/JavaScript. (2) You need the largest ecosystem of integrations. (3) You're building exploratory or research-oriented applications. (4) You need multi-agent systems (SK's multi-agent support is less mature).

---

## Additional Graph ML & KG Concepts

**28. RDF (Resource Description Framework)**
**Definition:** W3C standard data model for representing knowledge graphs as triples (subject, predicate, object), enabling interoperable data exchange.
### Theory & Explanation
RDF models all knowledge as statements in the form (subject, predicate, object) — "The sky has color blue" becomes (Sky, hasColor, Blue). Subjects and predicates are URIs (globally unique identifiers). Objects can be URIs (for entities) or literals (strings, numbers, dates). This simple triple structure makes RDF highly extensible — anyone can add statements about any resource using any vocabulary. Multiple serialization formats exist: Turtle (compact, human-readable), RDF/XML (machine-readable, integrates with XML toolchains), JSON-LD (JSON-based, web-friendly), and N-Triples (line-based, easy to parse). RDF enables data integration across sources — different organizations can publish RDF data using shared or mapped vocabularies, and SPARQL queries can span multiple datasets. The linked data principles extend RDF: use HTTP URIs for identifiers, provide useful information at those URIs, and include links to related URIs.
### Example
Turtle serialization: `@prefix foaf: <http://xmlns.com/foaf/0.1/> . @prefix ex: <http://example.org/> . ex:Alice a foaf:Person ; foaf:name "Alice" ; foaf:knows ex:Bob . ex:Bob foaf:name "Bob" .` This expresses: Alice is a person, her name is "Alice", she knows Bob, and Bob's name is "Bob". All identifiers are URIs making this publishable on the web.
### Interview Questions
**Q: What are the strengths and weaknesses of RDF compared to property graphs?**
A: RDF strengths: (1) Web-native — uses URIs, enabling global interoperability and data linking across sources. (2) Standards-based — W3C standards (RDFS, OWL, SPARQL) ensure long-term stability. (3) Open-world assumption — new statements can always be added without schema changes. Weaknesses: (1) Verbosity — URIs make RDF files large and hard to read. (2) No built-in property mechanism for edges (reification is complex). (3) Query performance — SPARQL is less efficient than Cypher/GraphQL for graph traversals. Property graphs are simpler, more performant for graph algorithms, and more intuitive for developers, but lack web-native interoperability.

**Q: What is SPARQL and how does it relate to RDF?**
A: SPARQL (SPARQL Protocol and RDF Query Language) is the query language for RDF data. It uses graph pattern matching — write patterns with variables, and the engine finds all matching subgraphs. Example: `SELECT ?name WHERE { ?person foaf:name ?name . ?person foaf:knows ex:Alice }` — find names of people who know Alice. SPARQL supports federation (query across multiple RDF datasets), graph construction (create new RDF graphs from query results), and update operations (INSERT/DELETE). SPARQL is to RDF as SQL is to relational databases.

---

**29. RDFS/OWL**
**Definition:** Ontology languages for defining the schema and logical constraints of knowledge graphs expressed in RDF.
### Theory & Explanation
RDF Schema (RDFS) provides basic ontology building blocks: classes (rdfs:Class), class hierarchies (rdfs:subClassOf — "Dog is a subclass of Animal"), properties (rdfs:Property), property hierarchies (rdfs:subPropertyOf), domain/range constraints (rdfs:domain, rdfs:range — "hasOwner property has domain Pet and range Person"). RDFS enables basic inference: if Dog subClassOf Animal, and Fido is a Dog, then Fido is also an Animal. OWL (Web Ontology Language) extends RDFS with expressive logical constraints: equivalence (owl:equivalentClass — "Person is equivalent to Human"), disjointness (owl:disjointWith — "Cat and Dog are disjoint"), property characteristics (owl:transitiveProperty — "isAncestorOf" is transitive; owl:inverseOf — "owns ⇔ isOwnedBy" are inverses; owl:functionalProperty — a person has exactly one birth date), cardinality restrictions (owl:cardinality — "exactly 2 parents"), and complex class expressions (owl:unionOf, owl:intersectionOf, owl:complementOf). OWL reasoners (Pellet, HermiT) can infer implicit knowledge, detect inconsistencies, and answer queries involving complex logical relationships.
### Example
RDFS: `ex:Vehicle rdfs:subClassOf ex:Machine . ex:Car rdfs:subClassOf ex:Vehicle . ex:hasSpeed rdfs:domain ex:Vehicle ; rdfs:range xsd:integer . ex:MyCar a ex:Car ; ex:hasSpeed 120 .` → Inference: MyCar is a Vehicle and also a Machine. OWL addition: `ex:Car owl:disjointWith ex:Boat . ex:Motorboat a ex:Boat .` → Reasoner can infer that ex:MyCar is not a Motorboat.
### Interview Questions
**Q: What is the trade-off between RDFS and OWL expressivity?**
A: RDFS is lightweight and efficient — basic class hierarchies and property constraints can be processed quickly, but the reasoning is limited. OWL 2 DL (Description Logic profile) provides rich expressivity (all relationship types) but reasoning is computationally expensive (worst-case NEXPTIME-complete). OWL 2 RL (Rule-based profile) provides a practical subset that can be implemented with rule engines (faster but less expressive). Choose RDFS when you need simple vocabulary organization. Choose OWL 2 RL for practical reasoning at scale. Choose OWL 2 DL when you need maximum expressivity and can tolerate slower reasoning.

**Q: How do ontologies differ from database schemas?**
A: Database schemas define structure with constraints but don't support inference — if you add a new category (e.g., "SUV is-a Car"), you must update the schema and rewrite queries. Ontologies are open-world: new classes, properties, and instances can be added without schema changes, and reasoners automatically infer new relationships. Database schemas use closed-world assumption (what's not in the DB is false); ontologies use open-world (what's not in the KG is unknown). This makes ontologies more flexible for evolving domains but harder to guarantee completeness.

---

**30. Node Embedding**
**Definition:** Unsupervised methods that learn low-dimensional vector representations of nodes in a graph by preserving the graph's structural properties.
### Theory & Explanation
Node embedding methods learn to map each node to a vector such that structurally similar nodes have similar vectors. DeepWalk (2014) pioneered random-walk-based embedding: (1) Run short random walks from each node (simulating graph exploration). (2) Treat each walk as a "sentence" of node IDs. (3) Apply Word2Vec (skip-gram) to learn embeddings that predict context nodes within the walk. Node2Vec (2016) extends DeepWalk with biased random walks controlled by two parameters: p (return parameter — high p avoids backtracking) and q (in-out parameter — high q focuses on local structure, low q explores outward). p > 1 + q < 1 = BFS-like (local neighborhoods). p < 1 + q > 1 = DFS-like (global structure). By tuning p and q, Node2Vec can capture different structural roles (hubs, bridges, periphery nodes).
### Example
In a social network graph: Node2Vec with p=1, q=0.5 → walks explore outward (DFS-like) → embeddings capture community structure (users in the same community have similar embeddings). Node2Vec with p=0.5, q=2 → walks stay local (BFS-like) → embeddings capture structural roles (two otherwise unconnected users who are both bridges between communities have similar embeddings).
### Interview Questions
**Q: How do node embeddings differ from GNN node representations?**
A: Node embeddings (DeepWalk, Node2Vec) are unsupervised and use only graph structure (edges). They don't incorporate node features, making them applicable to any graph but missing rich attribute information. GNN node representations (GCN, GAT) are typically supervised/semi-supervised and combine graph structure with node features (text, images, numerical attributes). GNNs are more expressive (can learn task-specific representations) but require labeled data and are more expensive. In practice: use node embeddings for unsupervised tasks (exploration, clustering) when you have just a graph; use GNNs for supervised tasks with rich node features.

**Q: How does the choice of p and q in Node2Vec affect embeddings?**
A: p (return parameter): low p → walk tends to backtrack, exploring local neighborhood (BFS-like). High p → walk avoids revisiting nodes, explores outward (DFS-like). q (in-out parameter): low q → walk prefers outward exploration (captures community structure). High q → walk stays near start node (captures structural equivalence — nodes with similar neighborhood patterns). Practically: for community detection → low q (0.5-1). For role detection (identifying hubs, bridges) → high q (2-4). For general tasks → p=1, q=1 (unbiased).

---

**31. Graph Embedding**
**Definition:** Methods that encode an entire graph or subgraph into a fixed-size vector representation, enabling graph-level prediction tasks.
### Theory & Explanation
While node embeddings represent individual nodes, graph embeddings represent entire graphs (collections of nodes and edges). This is essential for tasks like molecular property prediction (predict toxicity of a molecule from its graph structure). Graph2Vec (2019) extends the Node2Vec approach to graph-level: (1) Extract rooted subgraphs (WL kernel features) from all nodes across all graphs. (2) Treat each graph as a "document" of its subgraph features. (3) Apply Doc2Vec to learn graph embeddings. GL2Vec uses the same approach but also considers node and edge labels. More modern approaches use GNNs with readout functions: apply GNN layers to get node representations, then pool (mean, max, attention) to get graph representation. Graph-level embeddings are used for graph classification, similarity search (find similar molecules), and graph generation evaluation.
### Example
Molecular property prediction: 1000 molecules. Represent each molecule as a graph (atoms = nodes, bonds = edges). Graph2Vec embeds each molecule to a 128-dim vector. Train a classifier (random forest, SVM) on these vectors to predict "toxic or not" with 85% accuracy. Alternative: use a GNN with global mean pooling — end-to-end training achieves 92% but requires labeled data and compute.
### Interview Questions
**Q: How do graph embeddings differ from graph kernels?**
A: Graph kernels (WL kernel, shortest-path kernel, random walk kernel) measure similarity between graphs by comparing their substructures without producing explicit embeddings. They are interpretable (you can see which substructures match) but don't scale well (O(n²) graph comparisons). Graph embeddings produce explicit vectors (O(n) comparisons after embedding), enabling standard ML pipelines (SVM, neural nets). Modern approaches blur the line — GNNs with readout can be seen as learned, differentiable graph kernels.

**Q: When would you use graph-level embeddings vs node-level aggregation?**
A: Graph embeddings (Graph2Vec, GL2Vec) are unsupervised — you don't need labeled data to train them, but they may miss task-specific patterns. Node-level aggregation (GNN + readout) is supervised — you train end-to-end for the specific task, achieving better accuracy when labels are available. Use graph embeddings when: (1) You don't have labeled data. (2) You need a fixed-size representation for any downstream task. (3) You're doing exploratory analysis (clustering graphs). Use GNN + readout when: (1) You have labeled data. (2) Your task is well-defined. (3) You can tolerate training time.

---

**32. Graph Transformer**
**Definition:** Adapting the transformer architecture to graph-structured data by incorporating graph-specific positional encodings and attention mechanisms.
### Theory & Explanation
Graph Transformers apply the successful transformer architecture to graphs. The key challenge: transformers process sequences with explicit position information (sinusoidal positional encoding), but graphs lack a natural ordering. Solutions include: (1) Laplacian positional encoding: use eigenvectors of the graph Laplacian as position features — nodes with similar neighborhoods get similar position encodings. (2) Random walk structural encoding: encode structural roles based on landing probabilities of random walks. (3) Spatial encoding: encode shortest path distances between node pairs. Graph Transformers often outperform GNNs on molecular property prediction, especially for large graphs where GNN over-smoothing (all node representations converging) is a problem. Notable models: Graphormer uses centrality encoding (degree), spatial encoding (shortest path distance), and edge encoding (edge features in attention bias). TokenGT treats each node and edge as independent tokens with structural encoding. The main trade-off: Graph Transformers have O(N²) attention cost vs GNNs' O(N + E) — they're more expressive but less scalable.
### Example
On the ZINC molecular property prediction benchmark: Graphormer achieves MAE 0.122 (vs GNN baseline 0.25-0.35). For a molecule graph with N=50 atoms, the transformer computes 50×50 attention, capturing long-range interactions between distant atoms that GNNs (limited by message-passing depth) would miss.
### Interview Questions
**Q: When are Graph Transformers preferable to GNNs?**
A: Graph Transformers excel when: (1) Long-range dependencies matter — two distant nodes interact meaningfully (molecular property prediction where distant functional groups interact). (2) Graphs are moderate in size (N < 5000, where O(N²) attention is feasible). (3) Node features are rich and relationships are complex. GNNs are better for: (1) Large graphs (millions of nodes). (2) Inductive settings (generalizing to unseen graphs, where GNNs' local message passing generalizes better). (3) Resource-constrained environments. In practice, hybrid approaches (GNN + local attention) often work best.

**Q: What are the different positional encoding strategies for Graph Transformers?**
A: (1) Laplacian PE: eigenvectors of graph Laplacian — captures global graph structure but is sensitive to graph perturbations (adding/removing a node changes eigenvectors). (2) Random walk PE: based on random walk landing probabilities — captures structural roles, more stable. (3) Spatial PE: shortest path distances to a set of anchor nodes. (4) Degree PE: one-hot encoding of node degree — simple but limited. (5) SignNet: learns sign-invariant representations of eigenvectors (addressing sign ambiguity). The choice depends on whether you need global position (Laplacian) or local structure (Random walk PE).

---

**33. RGCN (Relational Graph Convolutional Network)**
**Definition:** Extension of Graph Convolutional Networks to heterogeneous graphs with multiple relation types, using separate weight matrices per relation.
### Theory & Explanation
Standard GCNs assume homogeneous graphs (one relation type). RGCN extends GCNs to heterogeneous graphs where edges have types (e.g., "friend_of", "works_at", "located_in"). The core idea: each relation type r has its own weight matrix W_r. Node i's representation is updated by aggregating over its neighbors, but the aggregation is relation-specific. For graphs with many relation types (e.g., knowledge graphs with hundreds of relation types), independent weight matrices per relation lead to massive parameter counts and overfitting. Two parameter sharing techniques address this: (1) Basis decomposition: W_r = Σ_b a_{rb} V_b — each relation's weight is a linear combination of a small set of basis matrices V_b. (2) Block-diagonal decomposition: W_r is block-diagonal, each block processes a subspace of features. RGCN achieves state-of-the-art on link prediction and node classification in heterogeneous graphs.
### Example
A knowledge graph with relations: (Paris, capitalOf, France), (Alice, worksAt, CompanyX), (Alice, friendOf, Bob). RGCN layer: Alice's representation aggregates from: Bob (friend relation, using W_friend), CompanyX (worksAt relation, using W_worksAt). The model learns different transformations for different relationship types — friend influence might propagate personal interests, while work influence propagates professional skills.
### Interview Questions
**Q: How does RGCN handle the problem of many relation types?**
A: With N relations and D-dimensional features, RGCN needs N × D × D parameters for the weight matrices. For 100 relations and 512 dimensions, that's 100 × 512² ≈ 26M parameters per layer — prohibitively large. Solutions: (1) Basis decomposition: learn B basis matrices (B << N, typically 10-50) and N sets of combination coefficients — total params: B × D² + N × B. (2) Block-diagonal matrices: each W_r is block-diagonal with B blocks of size D/B — reduces params from D² to B × (D/B)² = D²/B. Both techniques reduce params by 10-100x while maintaining reasonable expressivity.

**Q: When would you use RGCN vs simpler approaches for heterogeneous graphs?**
A: Use RGCN when: (1) There are multiple relation types (3+). (2) Each relation type likely requires different transformation patterns. (3) You have sufficient labeled data to train the many parameters. Use simpler approaches when: (1) Only 1-2 relation types — just use standard GCN. (2) Relations can be reduced to a single type (e.g., treat all edges the same). (3) Data is limited — simpler models (node embedding + classifier) may outperform RGCN.

---

**34. KGE (Knowledge Graph Embedding)**
**Definition:** Methods that embed entities and relations in a knowledge graph into low-dimensional vector spaces, representing graph structure through geometric operations.
### Theory & Explanation
Knowledge graphs store facts as (head, relation, tail) triples. KGE models learn embeddings such that the triple's plausibility score is high for true facts and low for false ones. Three landmark models: (1) TransE (Bordes et al., 2013): interpret relations as translations in embedding space — h + r ≈ t for a true triple. Score function: f(h,r,t) = -||h + r - t||. Simple, efficient, works well for 1-to-1 relations but struggles with 1-to-N, N-to-1, and symmetric relations. (2) ComplEx (Trouillon et al., 2016): use complex-valued embeddings (real + imaginary parts). The score uses Hermitian dot product, which captures symmetric and antisymmetric patterns naturally. (3) RotatE (Sun et al., 2019): model relations as rotations in complex space — t = h ◦ r (element-wise rotation by angle θ_r). Can model symmetric (θ_r = 0 or π), antisymmetric (θ_r ≠ 0, π), inverse (r₂ = -r₁), and compositional patterns.
### Example
TransE: (Einstein, bornIn, Germany) → vector(Einstein) + vector(bornIn) ≈ vector(Germany). (Germany, capitalOf, Berlin) → vector(Germany) + vector(capitalOf) ≈ vector(Berlin). Composition: vector(Einstein) + vector(bornIn) + vector(capitalOf) ≈ vector(Berlin) → captures that Einstein was born in the capital of Germany. RotatE: for relation (marriedTo) which is symmetric (A marriedTo B ⇔ B marriedTo A), RotatE learns rotation θ=0 (identity) — embedding(A) ≈ embedding(B) after rotation.
### Interview Questions
**Q: Compare TransE, ComplEx, and RotatE — strengths and weaknesses.**
A: TransE: simplest and fastest, works well for 1-to-1 relations in relatively clean KGs. Fails on symmetric relations and 1-to-N relations. ComplEx: handles symmetric/antisymmetric patterns naturally via complex embeddings, better on complex KGs. Higher computational cost. RotatE: most expressive — can model symmetry, antisymmetry, inversion, and composition in a unified framework. Best overall performance but highest training cost. Rule of thumb: start with TransE for clean, simple KGs; use RotatE for complex, real-world KGs.

**Q: How do you evaluate KGE models?**
A: Standard evaluation on link prediction: remove some triples from the KG, train on remaining, predict held-out triples. For each test triple (h,r,t), replace tail with all entities, rank by score. Metrics: Mean Reciprocal Rank (MRR — average of 1/rank across all test triples), Hits@K (fraction of test triples where correct entity is in top K — Hits@1, Hits@3, Hits@10). Key: filter setting — remove other valid triples from ranking. Filtered metrics are standard. Competitive scores on FB15k-237: MRR ~0.35, Hits@10 ~0.55 for RotatE.

---

**35. Link Prediction**
**Definition:** The task of predicting missing edges in a graph based on existing structure and node/edge features.
### Theory & Explanation
Link prediction asks: given a graph with some observed edges, which unobserved edges are likely to exist? This is fundamental for recommendation systems (predict user-item interactions), social networks ("people you may know"), biological networks (predict protein-protein interactions), and knowledge graph completion (predict missing facts). The standard setup: (1) Partition edges into training (observed), validation, and test (held-out). (2) Train a model to score the likelihood of an edge between any pair of nodes. (3) Evaluate on held-out edges. Approaches range from simple heuristics to deep learning: heuristics (Jaccard similarity, Adamic-Adar, preferential attachment), node embedding methods (compute similarity between learned embeddings), GNN-based methods (score edge from node representations), and KGE methods (score triples in KGs). Evaluation metrics: MRR, Hits@K, ROC-AUC. Negative sampling is critical — randomly sampled non-edges as negative examples, typically 10-100 negatives per positive.
### Example
Social network: 1000 users, 5000 known friendships. Train to predict missing friendships. Node2Vec embeddings for each user. For users A and B, friendship score = cosine similarity(embed(A), embed(B)). Top predictions: A-B: 0.95 (they share 10 mutual friends), A-C: 0.91 (in same community), A-D: 0.12 (no mutual friends, different communities). Evaluation on 500 held-out friendships: Hits@10 = 0.72.
### Interview Questions
**Q: What are the evaluation pitfalls in link prediction?**
A: (1) Time leakage: using future interactions to predict past — always split chronologically for temporal graphs. (2) Degree bias: high-degree nodes are easier to predict — report metrics stratified by node degree. (3) Negative sampling bias: random negative samples are too easy — use harder negatives (e.g., negative sampling with node degree weighting). (4) Cold start: new nodes with few connections are hard to predict — evaluate separately.

**Q: Compare heuristic-based vs learned link prediction.**
A: Heuristic methods (Jaccard, Adamic-Adar) are: fast (no training), interpretable, and strong baselines — often within 10-15% of learned methods. Learned methods (node embedding, GNN, KGE): more accurate, adaptable, and task-specific. Practical advice: always compute heuristic baselines first; if they're sufficient, stop. If not, use heuristics as features in a learned model.

---

**36. Node Classification**
**Definition:** Predicting the label of a node given the graph structure and (optionally) node features, typically in a semi-supervised setting where only a few nodes have labels.
### Theory & Explanation
Node classification is the most common graph ML task. The key challenge is semi-supervised learning — using the graph structure to propagate information from labeled to unlabeled nodes. Standard methods: (1) GCN: aggregate neighbor features with normalized adjacency. (2) GAT: learn attention weights to determine which neighbors matter more. (3) GraphSAGE: sample neighbors (instead of using all), making it scalable. Training is typically transductive (for GCN/GAT) or inductive (GraphSAGE). Evaluation: accuracy, F1-score. Standard datasets: Cora (2708 nodes, 7 classes), Pubmed (19717 nodes, 3 classes), ogbn-arxiv (169343 nodes, 40 classes). State-of-the-art accuracy on Cora: ~85-88%.
### Example
Cora citation network: nodes = papers, edges = citations, features = bag-of-words of paper abstracts, labels = research area (7 classes). GCN with 2 layers (16 hidden dimensions) trained on 20 labeled papers per class (140 total), predicts labels for the remaining 2568 papers. GCN achieves ~82% accuracy. Key insight: the graph structure helps — a paper about RL that cites other RL papers will be classified as RL even if its abstract uses ambiguous terms.
### Interview Questions
**Q: How does semi-supervised node classification work?**
A: The graph provides a smoothness prior — connected nodes likely share labels. During training, the GCN loss is computed only on labeled nodes (cross-entropy). But message-passing ensures that labeled nodes influence their neighbors' representations, and those neighbors influence further neighbors. After 2-3 GCN layers, the model's receptive field covers the entire graph, so every node's representation has been shaped by labeled nodes. This is transductive learning.

**Q: What are the limitations of GCN for node classification?**
A: (1) Over-smoothing: with many layers (4+), node representations converge to the same value. GCNs work best with 2-3 layers. (2) Homophily assumption: GCNs assume connected nodes have similar labels. On heterophilic graphs (where connected nodes have different labels), GCNs perform poorly. (3) Transductive: standard GCN can't predict labels for new nodes added after training. (4) Feature importance: GCN doesn't easily reveal which features drive predictions.

---

**37. Graph Classification**
**Definition:** Predicting a single label for an entire graph, learning from a dataset of labeled graphs.
### Theory & Explanation
Graph classification assigns a label to each graph as a whole. The standard pipeline: (1) Apply GNN layers to learn node representations within each graph. (2) Apply a readout/pooling function to aggregate all node representations into a single graph representation. Common readout functions: mean pooling, max pooling, sum pooling (captures graph size), attention pooling, hierarchical pooling (DiffPool). (3) Pass the graph representation through an MLP classifier. Applications: molecular property prediction (predict toxicity from molecular graph), bioinformatics (predict protein function), and cheminformatics. Standard datasets: MUTAG (188 graphs, 2 classes), PROTEINS (1113 graphs, 2 classes), ogbg-molhiv (41127 graphs).
### Example
Molecule: benzene (C₆H₆) as a graph — 6 carbon nodes (connected in a ring), 6 hydrogen nodes. GNN processes the graph, readout produces embedding. Classifier: is it mutagenic? Trained on 150 labeled molecules, predicts for 38 held-out. GNN achieves ~85% accuracy vs ~80% for fingerprint-based baselines.
### Interview Questions
**Q: How does graph classification differ from node classification?**
A: Node classification predicts per-node labels using global graph structure. Graph classification predicts a global label per graph — the model must learn to ignore graph-irrelevant details and focus on label-relevant subgraphs. Different pooling strategies encode different inductive biases: sum pooling captures graph size, mean pooling is size-invariant, attention pooling learns which nodes are task-relevant. Graph classification requires multiple training graphs (typically 100+).

**Q: What are the limitations of GNN-based graph classification?**
A: (1) Expressive power: standard GNNs are at most as powerful as the WL test — they can't distinguish certain non-isomorphic graphs. (2) Global structure: GNNs with few layers see only local neighborhoods; many layers cause over-smoothing. (3) Interpretability: hard to identify which substructures drive classification. (4) Data efficiency: GNNs need more labeled graphs than fingerprint-based methods for molecular tasks.

---

**38. WL Test (Weisfeiler-Lehman)**
**Definition:** A color refinement algorithm for testing graph isomorphism, which also bounds the expressive power of message-passing GNNs.
### Theory & Explanation
The WL test determines whether two graphs are non-isomorphic. The algorithm: (1) Assign each node an initial color. (2) Iteratively refine colors: for each node, hash the multiset of its current color and its neighbors' colors to produce a new color. (3) After each iteration, compare the color histogram of both graphs. If histograms differ, graphs are non-isomorphic. The WL test fails on some regular graphs. The key connection to GNNs: Xu et al. (2018) proved that message-passing GNNs (GCN, GAT, GraphSAGE) are at most as powerful as the WL test at distinguishing graph structures. The most powerful GNN in the WL class uses SUM aggregation (not MEAN or MAX) and injective neighbor aggregation functions (GIN — Graph Isomorphism Network).
### Example
Two graphs: Graph A: (1-2, 2-3, 3-1, 3-4) — triangle + leaf. Graph B: (1-2, 2-3, 3-4, 4-1) — square (4-cycle). WL test: iteration 1 — all nodes degree 1 or 2 → colors: Graph A has one node degree 1 (leaf), three degree 2; Graph B has four degree 2. Histograms differ → non-isomorphic.
### Interview Questions
**Q: What does it mean that GNNs are "at most as powerful as the WL test"?**
A: It means the set of graph pairs that a GNN can distinguish is a subset of the pairs the WL test can distinguish. If two graphs get different WL color histograms, a sufficiently powerful GNN can distinguish them. If WL fails (same histograms for non-isomorphic graphs), no GNN can distinguish them. This is a fundamental limitation.

**Q: Which GNN aggregation function is most expressive?**
A: SUM is the most expressive. MEAN loses information about multiset size. MAX loses both size and frequency information. GIN uses SUM + MLP to achieve WL-level expressivity. However, SUM is sensitive to graph size — for tasks where size is irrelevant, MEAN may work better in practice.

---

**39. Property Graph**
**Definition:** A graph data model where both nodes and edges can have arbitrary key-value properties, used by most production graph databases.
### Theory & Explanation
The property graph model is the most widely used graph database model (Neo4j, Amazon Neptune, JanusGraph). Key characteristics: (1) Nodes represent entities and can have labels (types) and properties. (2) Edges represent relationships with a direction, a type, and optional properties. (3) A node can have multiple labels, and an edge has exactly one type. Unlike RDF, property graphs do not require URIs. The standard query language is Cypher (Neo4j): `MATCH (a:Person {name: "Alice"})-[r:KNOWS]->(b:Person) RETURN b.name, r.since`. Property graphs excel at: graph traversal algorithms, path finding, recommendation, fraud detection.
### Example
Social network as property graph: Node (Person: {name: "Alice", age: 30}), Node (Person: {name: "Bob", age: 25}), Edge (KNOWS: {since: 2020}) from Alice to Bob. Cypher: `MATCH (a:Person {name: "Alice"})-[r:KNOWS]-(friend) WHERE r.since > 2019 RETURN friend.name` → Returns "Bob".
### Interview Questions
**Q: Compare property graph model with RDF model.**
A: Property graph: simpler, more intuitive, efficient for traversal algorithms, excellent ecosystem (Neo4j, Cypher). Schema-flexible. RDF: web-native (URIs), standards-based (W3C), supports inference via RDFS/OWL, ideal for data integration across sources. RDF is better for open-world data and knowledge graphs that need to interlink with other datasets. Property graphs are better for transactional graph applications.

**Q: What are the limitations of the property graph model?**
A: (1) No formal semantics — no inference or consistency checking. (2) No built-in data typing. (3) No standard URI scheme for entities. (4) No W3C-equivalent standard for serialization. (5) Schema evolution requires migrations.

---

**40. PageRank**
**Definition:** An algorithm that ranks nodes in a graph by their importance, based on the random surfer model — the probability of arriving at each node through random walks with occasional teleportation.
### Theory & Explanation
PageRank (Page & Brin, 1998) was the original Google ranking algorithm. The core idea: a page is important if other important pages link to it. The random surfer model: a user browses by randomly clicking links. Occasionally (with probability d, the damping factor, typically 0.85), they teleport to a random page. PageRank of a page is the probability that the random surfer is on that page. Mathematically: PR(p) = (1-d)/N + d × Σ_{q ∈ in(p)} PR(q) / out_degree(q). PageRank is query-independent, democratic (each link is a vote), and robust to spam.
### Example
Web graph: A → B → C (A links to B, B links to C). Also D → A, D → B, D → C. With d=0.85: Page A gets authority from D. Page B gets from A and D. After convergence (N=4): PR ≈ [A: 0.3, B: 0.35, C: 0.25, D: 0.1] — B is most important.
### Interview Questions
**Q: How is PageRank used beyond web search?**
A: (1) Social network analysis: find influential users. (2) Recommendation: personalized PageRank for "items you might like." (3) Biological networks: rank genes by importance. (4) Knowledge graphs: identify central entities. (5) NLP: TextRank for keyword extraction and summarization.

**Q: What are the limitations of PageRank?**
A: (1) Topic drift — a page about "AI" linked by a "sports" site dilutes relevance. (2) Freshness — old pages stay high-ranked forever. (3) Link spam — link farms can inflate PageRank. (4) Cold start — new pages have no incoming links. (5) Computation cost on billion-node graphs.

---

**41. Graph-of-Thoughts (GoT)**
**Definition:** A reasoning framework where thoughts are nodes in a graph and dependencies between thoughts are edges, enabling parallel exploration, merging, and refinement.
### Theory & Explanation
GoT (Besta et al., 2023) generalizes Chain-of-Thought (linear chain) and Tree-of-Thoughts (tree with branching). In GoT, reasoning is a directed graph: nodes = individual thoughts, edges = dependencies. This enables: (1) Branching — explore multiple hypotheses in parallel. (2) Merging — combine insights from different branches. (3) Refinement — loop back and improve earlier thoughts. (4) Aggregation — combine partial results into a final answer. GoT operations: create thought, refine thought, merge thoughts, and loop. GoT outperforms CoT and ToT on tasks requiring multi-source reasoning, iterative improvement, and complex planning.
### Example
Solving a complex math problem: Node A: "identify variables" → Node B: "formulate equation 1" → Node C: "formulate equation 2" (parallel to B) → Node D: "merge equations" (combines B and C) → Node E: "solve merged system" → Node F: "verify solution" → if F fails, create Node G: "refine" (loops back). The graph structure allows backtracking without discarding work.
### Interview Questions
**Q: How does GoT compare with CoT and ToT?**
A: CoT is linear — one path. ToT is a tree — multiple parallel paths with best-first selection. GoT is a graph — paths can converge (merge insights), diverge (explore), and loop (refine). GoT is strictly more expressive than ToT, and ToT more expressive than CoT. Use CoT for simple reasoning, ToT for tasks with clear intermediate choices, GoT for complex multi-source tasks.

**Q: What are the practical challenges of implementing GoT?**
A: (1) Graph management — maintaining a dynamic graph of thoughts. (2) Operation selection — deciding when to branch, merge, or refine requires a meta-reasoner. (3) Cost — each node requires an LLM call. (4) Evaluation — no standardized benchmarks. (5) Stopping criteria — confidence threshold, iteration limit, or convergence detection.

---

## Additional Fine-Tuning Concepts

**42. P-Tuning v2**
**Definition:** A parameter-efficient fine-tuning method that learns continuous (soft) prompt embeddings at every layer of the transformer, not just the input layer.
### Theory & Explanation
P-Tuning v2 (Liu et al., 2023) builds on prompt tuning (learn a small set of continuous prompt tokens prepended to the input). The key innovation: prompt tuning only adds learnable tokens to the input embedding layer, which limits expressivity. P-Tuning v2 adds learnable prompts to every transformer layer's hidden states. At each layer i, a learnable matrix P_i (prompt_length × hidden_dim) is inserted. This matches the expressivity of full fine-tuning while only training ~0.1-3% of parameters. P-Tuning v2 bridges the quality gap with full fine-tuning on harder tasks (NLU, sequence labeling) where standard prompt tuning lags significantly. Prompt lengths of 10-50 tokens per layer work best.
### Example
Fine-tuning a 7B model with P-Tuning v2: num_layers=32, prompt_length=20, hidden_dim=4096 → trainable params = 32 × 20 × 4096 = 2.6M (< 0.04% of 7B). This achieves 95%+ of full fine-tuning performance on GLUE benchmarks, vs standard prompt tuning at 80-85%. Training memory: ~8 GB vs ~60+ GB for full FT.
### Interview Questions
**Q: How does P-Tuning v2 differ from prefix tuning?**
A: Both add learnable tokens to each layer, but: Prefix tuning prepends learnable key-value pairs to the attention mechanism at each layer. P-Tuning v2 prepends learnable tokens to the hidden states at each layer. P-Tuning v2 recommends adding prompts to every layer and using a classification head on prompt tokens for NLU tasks.

**Q: When is P-Tuning v2 preferred over LoRA?**
A: P-Tuning v2 is preferred when: (1) The task primarily involves modifying model behavior without changing factual knowledge. (2) You need per-layer control. (3) You want the most parameter-efficient approach (0.1% vs 0.5-2% for LoRA). LoRA is preferred when: (1) The task requires adapting to new factual knowledge. (2) You want simpler implementation. (3) You need zero inference overhead (merge adapters into base weights).

---

**43. IA³ (Infused Adapter by Inhibiting and Amplifying Activations)**
**Definition:** An extremely parameter-efficient fine-tuning method that learns scaling vectors applied to key, value, and feed-forward activations, using only ~0.01% of parameters.
### Theory & Explanation
IA³ (Liu et al., 2022) learns three scaling vectors: l_k (applied to keys), l_v (applied to values), and l_ff (applied to feed-forward activations). Each vector has dimension equal to the corresponding layer's feature dimension. The scaling operation: output = s ⊙ a. Total trainable params ≈ 3 × num_layers × hidden_dim. For a 7B model: 3 × 32 × 4096 ≈ 393K parameters (< 0.006% of 7B). Despite extreme efficiency, IA³ achieves competitive performance with full fine-tuning (within 1-3% on most NLU benchmarks). Training memory overhead is negligible — can fine-tune a 7B model on a single GPU.
### Example
Fine-tuning LLaMA-7B with IA³: 393K trainable parameters. Memory: ~16 GB (half-precision) — fits on a single RTX 3090. After fine-tuning on sentiment classification: accuracy 93.5% vs full FT 94.2%. The scaling vectors can be folded into base weights, adding zero inference overhead.
### Interview Questions
**Q: How does IA³ compare with LoRA?**
A: IA³ is more parameter-efficient (0.006% vs 0.5-2%) and has lower training memory. However, IA³'s scaling vectors can only amplify or suppress existing activations, not create new feature combinations. LoRA can learn new patterns through its low-rank update. On complex tasks, LoRA typically outperforms IA³ by 1-3%.

**Q: How do you deploy IA³ in production?**
A: IA³'s scaling vectors can be folded into base weights: W_key_new = diag(l_k) × W_key_original. Zero inference overhead. Storage is tiny (few KB per model). Ideal for: edge deployment, serving many fine-tuned variants from one base model, and rapid adapter switching.

---

**44. Multi-task Fine-tuning**
**Definition:** Training a model on multiple tasks simultaneously, using a shared representation that benefits all tasks through cross-task transfer.
### Theory & Explanation
Instead of fine-tuning a separate model per task, multi-task fine-tuning trains one model on many tasks at once. Each batch contains examples from different tasks with task-specific loss functions. Shared transformer layers learn universal representations. Key challenges: (1) Task balancing — use loss weighting or proportional sampling. (2) Negative transfer — conflicting tasks degrade each other. (3) Catastrophic forgetting — interleaving tasks helps. T5 and FLAN are prominent examples — they frame every task as text-to-text, enabling unified multi-task training.
### Example
FLAN fine-tuned T5 on 60+ tasks simultaneously: classification, QA, summarization, translation. Each task is reformatted as an instruction. After multi-task training, the model generalizes to unseen tasks — it can perform tasks never explicitly trained on. FLAN outperforms single-task fine-tuning on 20 of 25 evaluation tasks.
### Interview Questions
**Q: How do you handle conflicting tasks in multi-task learning?**
A: Solutions: (1) Task-specific adapters — shared base + task-specific small modules. (2) Uncertainty weighting — weight each task's loss by model uncertainty. (3) Gradient surgery (PCGrad) — when gradients conflict, project one onto the normal of the other. (4) Progressive training — train on similar tasks first, add conflicting tasks later.

**Q: How does multi-task fine-tuning compare to single-task + prompt engineering?**
A: Multi-task creates one model for many tasks, reducing deployment complexity and enabling zero-shot generalization. Single-task fine-tuning often achieves higher per-task performance. Prompt engineering is simplest but limited. Pattern: single-task for the most important task, multi-task for supporting tasks, prompt engineering for simple tasks.

---

**45. Domain Adaptation**
**Definition:** Continuing pre-training on a domain-specific corpus to bridge the distribution gap between general pre-training data and the target domain.
### Theory & Explanation
General LLMs are pre-trained on internet text. When applied to specialized domains, there's a domain gap. Domain adaptation closes this through continued pre-training (DAPT). The process: (1) Collect domain text (1-100 GB). (2) Continue masked language modeling on this corpus. (3) The model learns domain-specific vocabulary, terminology, and conventions. (4) Then fine-tune on downstream tasks. Notable examples: BioBERT (PubMed), ClinicalBERT (clinical notes), LegalBERT (legal documents), CodeBERT (code). Domain adaptation improves in-domain performance by 2-10%.
### Example
BioBERT: BERT pre-trained on general text → continue MLM on PubMed abstracts (4.5B words) + PMC full-text (13.5B words). Result: BioBERT achieves 85% F1 on biomedical NER vs 80% for BERT-base — 5% improvement from domain adaptation alone.
### Interview Questions
**Q: How much domain data is needed?**
A: 100M-1B tokens minimum. For narrow domains, 10M-100M tokens can still help. The data must be high-quality and diverse. Diminishing returns after ~10B tokens.

**Q: How does domain adaptation differ from full pre-training?**
A: Full pre-training starts from random weights on trillions of tokens (months, thousands of GPUs). Domain adaptation continues from a pre-trained model on billions of tokens (days, single GPU). Much cheaper — BioBERT trained on 1 GPU for 10 days vs millions of GPU-hours for BERT.

---

**46. Parameter Efficiency Comparison Table**
**Definition:** A structured comparison of PEFT methods across key dimensions.

| Method | Trainable Params % | Training Memory (7B) | Quality vs Full FT | Inference Overhead |
|---|---|---|---|---|
| **Full Fine-Tuning** | 100% | ~120 GB (FP16) | Baseline | None |
| **LoRA (r=8)** | 0.5-2% | ~32 GB | 95-99% | None* |
| **QLoRA** | 0.5-2% | ~10 GB (4-bit) | 94-98% | None* |
| **Adapter** | 3-6% | ~40 GB | 97-99% | Small |
| **Prompt Tuning** | 0.01-0.1% | ~16 GB | 80-90% | Small |
| **Prefix Tuning** | 0.1-1% | ~20 GB | 85-95% | Small |
| **P-Tuning v2** | 0.1-3% | ~24 GB | 93-98% | Medium |
| **IA³** | 0.006% | ~16 GB | 90-95% | None* |

* Zero overhead when merged into base weights.

### Interview Questions
**Q: How do you choose the right PEFT method?**
A: Single GPU (24 GB or less) → QLoRA or IA³. Need zero inference overhead → LoRA or IA³. Quality paramount → full FT or LoRA (r=64-128). Many task-specific adapters → IA³ (few KB each). NLU behavior modification → P-Tuning v2. Multi-task → LoRA with task-specific adapters.

**Q: What are the practical implications of QLoRA's 4-bit quantization?**
A: Reduces memory 4x: LLaMA-65B fits on a single 48GB GPU. Quality drop only 1-2% vs full FT. Benefits: fine-tune 7B models on consumer GPUs, 65B+ on single A100. Trade-off: training 20-30% slower due to quantization/dequantization overhead.

---

## Additional Evaluation & Hallucination Concepts

**47. BLEURT**
**Definition:** A learned evaluation metric based on BERT, trained on human judgments to measure text generation quality with higher correlation to human evaluation than traditional metrics.
### Theory & Explanation
BLEURT (Sellam et al., 2020) addresses the limitation of n-gram metrics (BLEU, ROUGE): they don't capture semantic similarity. BLEURT fine-tunes BERT on two stages: (1) Pre-training on synthetic data: generate millions of (reference, candidate) pairs with controlled perturbations (masking, back-translation, word dropout) and train BERT to predict the perturbation type. (2) Fine-tuning on human judgments: fine-tune on WMT human evaluation data. The final model takes (reference, candidate) as input and outputs a quality score. BLEURT achieves 0.45-0.55 Pearson correlation with human judgments on translation, vs 0.20-0.35 for BLEU.
### Example
Reference: "The cat sat on the mat." Candidate A: "The feline rested on the rug." Candidate B: "Cat mat sat the." BLEU: A = 0.3, B = 0.25. BLEURT: A = 0.85, B = 0.15. BLEURT correctly identifies A as better because it captures semantic equivalence.
### Interview Questions
**Q: How does BLEURT compare with BERTScore?**
A: BERTScore computes pairwise cosine similarity between reference and candidate token embeddings. It requires no training. BLEURT fine-tunes BERT end-to-end on human judgment data. BLEURT correlates better with human judgment but is more expensive and needs domain-specific training data.

**Q: What are the limitations of BLEURT?**
A: (1) Reference-dependent — can't evaluate open-ended generation. (2) Domain sensitivity — trained on translation data may not work for summarization. (3) Computational cost — full BERT forward pass per pair. (4) Score interpretation — only relative comparisons are valid.

---

**48. Factual Consistency**
**Definition:** Measuring whether a generated text is factually consistent with its source — the opposite of hallucination.
### Theory & Explanation
Factual consistency checks if the generation adds, contradicts, or distorts information from the source. The dominant approach uses NLI: treat source as premise, generation as hypothesis, classify as entailment (consistent) or contradiction (inconsistent). Key systems: FactCC, SummaC (sentence-level NLI with max contradiction aggregation), AlignScore (unified alignment model), SelfCheckGPT (multiple generations, no source needed). NLI-based approaches achieve 70-90% accuracy. Challenges: correct but not in source (general knowledge), verbose generations (decompose into atomic claims).
### Example
Source: "The Eiffel Tower is 330 meters tall and was completed in 1889." Generation: "The Eiffel Tower, a 330-meter landmark, was finished in 1889. It was designed by Gustave Eiffel." Sentence 1: entailment. Sentence 2: "designed by Eiffel" — not in source but well-known fact → neutral (decision depends on strict vs permissive mode).
### Interview Questions
**Q: How do you handle the strict vs permissive consistency trade-off?**
A: Strict mode: only accept information in the source (best for summarization). Permissive mode: accept verifiably true information (best for QA). Hybrid: if a claim is not in source, check against a knowledge base or LLM. Use strict for high-stakes domains (medical, legal).

**Q: Compare NLI-based vs LLM-based factual consistency.**
A: NLI-based: faster, deterministic, interpretable, but limited to single-source comparison. LLM-based: more flexible, can use general knowledge, provides explanations, but slower and less deterministic. Best practice: use NLI for high-volume automated evaluation, LLM for detailed analysis of edge cases.

---

**49. A/B Evaluation**
**Definition:** A live evaluation method where two systems each serve a portion of user traffic, and performance is compared on real user engagement metrics.
### Theory & Explanation
A/B testing evaluates systems with real users in production. Process: (1) Define hypothesis. (2) Split traffic randomly (50/50). (3) Run for sufficient duration (1-2 weeks). (4) Measure metrics: primary (task success rate, satisfaction) and secondary (latency, cost). (5) Statistical analysis (p < 0.05). (6) Decision. Challenges: novelty effect, network effects, multiple metric testing (Bonferroni correction).
### Example
RAG chatbot A (no citations) vs B (with citations). Metrics: Task success: A=72%, B=78% (p=0.03). User satisfaction: A=3.8, B=4.1 (p=0.01). Conclusion: B improves success and satisfaction. Roll out to all users.
### Interview Questions
**Q: What are the risks of A/B testing in LLM applications?**
A: (1) Quality risk — bad system harms user trust. Start with small traffic (5-10%). (2) Cost risk — expensive model improves metrics but costs 10x. (3) Randomization bias — consistent cookie-based assignment. (4) Content safety — moderation in the loop. (5) Interaction effects — segment results by query type.

**Q: How long should an A/B test run?**
A: 2 weeks minimum for high-traffic systems (100K+ queries/day), 4 weeks for low-traffic. Consider weekly patterns. Stop early only if clearly harmful or overwhelmingly significant.

---

**50. ARES (Automated RAG Evaluation System)**
**Definition:** An LLM-based evaluation framework specifically designed for RAG systems, using three fine-tuned evaluator models for context relevance, answer faithfulness, and answer relevance.
### Theory & Explanation
ARES (Saad-Falcon et al., 2023) works in three stages: (1) Synthetic data generation: use an LLM to generate synthetic questions, contexts, and answers from the knowledge base. (2) Train evaluators: fine-tune three lightweight LLM classifiers: Context Relevance evaluator, Answer Faithfulness evaluator, Answer Relevance evaluator. (3) Evaluate: run all three evaluators and aggregate scores. ARES achieves 85-95% agreement with human evaluators. The key advantage: evaluators are domain-adapted.
### Example
RAG system for legal documents. ARES generates: Question: "What is the statute of limitations for breach of contract in California?" Retrieved context: legal document chunk. Answer: [system answer]. Evaluators score: context relevance (0.9), answer faithfulness (0.85), answer relevance (0.88). Combined score = 0.88.
### Interview Questions
**Q: How does ARES differ from using a general LLM-as-judge?**
A: ARES trains domain-specific evaluators on synthetic data from your corpus, making them more accurate for your specific domain. General LLM-as-judge is prompt-dependent and may not capture domain-specific notions of relevance and faithfulness. ARES is more expensive to set up (requires training) but provides more consistent, interpretable evaluations.

**Q: What are the failure modes of ARES?**
A: (1) Synthetic data quality — if generated data doesn't reflect real queries, evaluators won't generalize. (2) Evaluator model capacity — lightweight classifiers may miss nuanced patterns. (3) Domain shift — if the knowledge base changes significantly, evaluators need retraining. (4) Three scores don't capture all quality dimensions (e.g., coherence, safety).

---

**51. TruLens**
**Definition:** An evaluation toolkit for LLM applications that measures groundedness, relevance, and coherence using feedback functions.
### Theory & Explanation
TruLens provides three core evaluation dimensions: (1) Groundedness: is the output supported by the retrieved context? Uses NLI to check each sentence against the context. (2) Relevance: does the output address the input question/query? Measures semantic similarity between input and output. (3) Coherence: is the output well-structured and logically flowing? Measures readability and structure. Each dimension is scored 0-1 via feedback functions. TruLens also provides: dashboard for tracking evaluations over time, app comparison (A/B testing), and guardrails (threshold-based alerts). It integrates with LangChain, LlamaIndex, and custom applications. The feedback functions can use: NLI models, embedding similarity, LLM-as-judge, or custom logic.
### Interview Questions
**Q: How do TruLens' three dimensions map to RAG quality?**
A: Groundedness → retrieval quality (did the system use the context correctly?). Relevance → query understanding (did the system answer the right question?). Coherence → generation quality (is the output well-formed?). Together they provide a holistic view: a system could have high relevance and coherence but low groundedness (fluent but hallucinated), or high groundedness and relevance but low coherence (correct but poorly structured).

**Q: How would you use TruLens in a CI/CD pipeline?**
A: Run TruLens evaluation on a test set after each model update or RAG pipeline change. Set thresholds (e.g., groundedness > 0.8, relevance > 0.85). If any score drops below threshold, block deployment. Track scores over time to detect regression. Use the dashboard to compare candidate and production systems side by side.

---

**52. Prompt-based Hallucination Detection**
**Definition:** Using an LLM to determine whether a generated response contradicts or is unsupported by its source context, through carefully crafted detection prompts.
### Theory & Explanation
The simplest hallucination detection approach: ask an LLM evaluator directly. For example: "Does the following answer contain information not supported by the context? Answer only 'Yes' or 'No'." This can be enhanced with chain-of-thought: "List each factual claim in the answer. For each claim, determine if it's supported by the context. Then provide your verdict." Key design choices: (1) Granularity: sentence-level, claim-level, or holistic. (2) Prompt specificity: binary classification vs detailed analysis. (3) Model selection: same model (faster, may have same blind spots) or stronger model (more accurate, slower, costlier). Accuracy is 70-90% depending on task complexity and model strength. Best combined with other methods for production use.
### Example
Prompt: "Context: {retrieved_chunks}\n\nAnswer: {generated_answer}\n\nIdentify each factual claim in the answer. For each claim, mark it as: Supported (directly stated in context), Contradicted (context says the opposite), or Not in Context (not mentioned in context). Then give an overall verdict: Consistent, Partially Consistent, or Inconsistent."
### Interview Questions
**Q: What are the failure modes of prompt-based detection?**
A: (1) Same-model bias — if the generator and evaluator are the same model, it may confirm its own hallucinations. Mitigation: use a different, stronger model for evaluation. (2) Prompt sensitivity — small prompt changes produce different results. Mitigation: use structured prompts with clear output format. (3) Overconfidence — the evaluator may confidently misclassify. Mitigation: request confidence scores alongside verdicts. (4) Long context — with many claims, the evaluator may miss some. Mitigation: decompose into atomic claims first.

**Q: When is prompt-based detection preferable to NLI-based?**
A: Prompt-based is preferable when: (1) You need flexible, open-ended evaluation (not just entailment/contradiction). (2) The source context is multi-document or conversational (NLI assumes single premise). (3) You want explanations alongside scores. (4) You're already using an LLM for generation and can reuse it. NLI-based is better for: high-throughput, low-latency settings, and when you need consistent, deterministic outputs.

---

**53. Token-level Probability Detection**
**Definition:** Detecting hallucinations by analyzing token-level probabilities — low probability on key factual tokens signals potential hallucination.
### Theory & Explanation
The intuition: when a model hallucinates, it tends to generate key information tokens (dates, names, numbers) with lower probability than when it generates grounded facts. The approach: (1) Identify information tokens in the generated text (entities, dates, numbers, technical terms) using NER or regex. (2) Extract the model's log probability for each information token at generation time. (3) Aggregate: low average probability → high hallucination risk. Simple metrics: mean probability of information tokens, minimum probability, or entropy across the sequence. More sophisticated: semantic entropy (cluster multiple generations by meaning, compute entropy across clusters). Token-level methods are fast (no additional LLM calls) but less accurate than consistency-based methods (70-80% accuracy). They work best for detecting simple factual errors (wrong date, wrong name) but miss contextual inconsistency (contradicting earlier statements, violating common sense).
### Example
Generation: "The Eiffel Tower was completed in 1889 and is 330 meters tall." Token probabilities: the=0.99, Eiffel=0.97, Tower=0.98, was=0.99, completed=0.95, in=0.99, 1889=0.45 (low — model uncertain about the year), and=0.99, is=0.99, 330=0.52 (low — model uncertain about height), meters=0.97, tall=0.99. Average on information tokens (1889, 330): 0.485 → below threshold → flag as potential hallucination. Correct: the model was indeed uncertain about the exact numbers.
### Interview Questions
**Q: What are the advantages and disadvantages of token-level detection?**
A: Advantages: (1) Fast — no additional LLM calls, uses generation-time probabilities. (2) Cheap — minimal computational overhead. (3) Real-time — can be applied during generation to trigger retrieval (FLARE) or regeneration. Disadvantages: (1) Lower accuracy (70-80%) compared to consistency-based methods (85-95%). (2) Only catches uncertainty, not confident hallucinations (the model can be confidently wrong with high token probabilities). (3) Doesn't detect contextual inconsistencies (contradicting information spread across sentences). (4) Requires access to token-level log probabilities (not all APIs expose these).

**Q: How does semantic entropy improve on simple token-level probability?**
A: Token-level probability captures per-token uncertainty but misses semantic consistency — the model might be confident on each token but the overall meaning is wrong. Semantic entropy: generate multiple responses (N=5-10 with temperature > 0), cluster them by semantic meaning (using entailment or embedding similarity), compute entropy across clusters. High semantic entropy = many different meanings across generations = high hallucination risk. This captures both token-level uncertainty and meaning-level inconsistency. Cost: N times more generation calls.
