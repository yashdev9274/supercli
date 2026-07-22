# Complete Concept Reference — Master Index

> Every concept listed below links to its explanation in the study guide files.
> File anchors use GitHub-style markdown heading anchors (lowercase, hyphens for spaces, punctuation removed).

---

## 1. PYTHON (for Data Science)

| Concept | Covered In | File |
|---------|-----------|------|
| List, Tuple, Set, Dict | Built-in Python knowledge — referenced across all files | General |
| List Comprehension, Lambda, map/filter/reduce | Used in code examples throughout | All files |
| NumPy array, Pandas Series/DataFrame | Data manipulation context in [01-data-science.md](./01-data-science.md#example-10) | [01](./01-data-science.md) |
| Missing data (NaN), dropna(), fillna() | Data cleaning context in [01-data-science.md](./01-data-science.md#eda-exploratory-data-analysis) | [01](./01-data-science.md#eda-exploratory-data-analysis) |
| Generator, Decorator, `is` vs `==` | Python-specific gotchas — implicit knowledge | General |
| `*args`/`**kwargs`, mutable default args | Python-specific — not directly covered | General |

---

## 2. DATA SCIENCE (General)

### CRISP-DM
- **Status:** ❌ NOT COVERED — needs to be added
- **Target file:** [01-data-science.md](./01-data-science.md)

### Supervised, Unsupervised, Semi-supervised, RL
| Concept | Section | File |
|---------|---------|------|
| Supervised Learning | [Semi-supervised Learning](./01-data-science.md#semi-supervised-learning) — Theory & Explanation | [01](./01-data-science.md#semi-supervised-learning) |
| Unsupervised Learning | K-Means, PCA, clustering methods in [02-machine-learning.md](./02-machine-learning.md#k-means-clustering) | [02](./02-machine-learning.md#k-means-clustering) |
| Semi-supervised Learning | [Semi-supervised Learning](./01-data-science.md#semi-supervised-learning) — full section | [01](./01-data-science.md#semi-supervised-learning) |
| Reinforcement Learning | [Reinforcement Learning](./01-data-science.md#reinforcement-learning) — full section | [01](./01-data-science.md#reinforcement-learning) |

### Overfitting / Underfitting / Bias-Variance Tradeoff
- **Status:** ❌ NOT COVERED as standalone sections
- Overfitting mentioned in context of [Decision Trees](./02-machine-learning.md#decision-trees), [XGBoost](./02-machine-learning.md#xgboost), [Random Forest](./02-machine-learning.md#random-forest) and [Autoencoder](./03-deep-learning-and-nlp.md#autoencoder)
- **Target file:** [02-machine-learning.md](./02-machine-learning.md)

### Cross-Validation / Stratified CV
- **Status:** ❌ NOT COVERED as standalone sections
- Cross-validation referenced in [Hyperparameter Tuning](./02-machine-learning.md#hyperparameter-tuning) example
- **Target file:** [02-machine-learning.md](./02-machine-learning.md)

### Feature Engineering / Feature Selection
| Concept | Section | File |
|---------|---------|------|
| Feature Engineering | Referenced in EDA section [01-data-science.md](./01-data-science.md#eda-exploratory-data-analysis) | [01](./01-data-science.md#eda-exploratory-data-analysis) |
| Feature Selection | PCA as dim reduction [02-machine-learning.md](./02-machine-learning.md#pca-principal-component-analysis) | [02](./02-machine-learning.md#pca-principal-component-analysis) |

### Imbalanced Data
| Concept | Section | File |
|---------|---------|------|
| Imbalanced Data | [Imbalanced Data](./01-data-science.md#imbalanced-data) — full section | [01](./01-data-science.md#imbalanced-data) |
| SMOTE, Class Weights | [Imbalanced Data](./01-data-science.md#example-8) — example | [01](./01-data-science.md#example-8) |

### EDA (Exploratory Data Analysis)
| Concept | Section | File |
|---------|---------|------|
| EDA | [EDA](./01-data-science.md#eda-exploratory-data-analysis) — full section | [01](./01-data-science.md#eda-exploratory-data-analysis) |

### A/B Testing
| Concept | Section | File |
|---------|---------|------|
| A/B Testing | [A/B Testing](./01-data-science.md#ab-testing) — full section | [01](./01-data-science.md#ab-testing) |
| p-value | [A/B Testing](./01-data-science.md#theory--explanation-31) — Theory & Explanation | [01](./01-data-science.md#theory--explanation-31) |
| Shapiro-Wilk Test | [Shapiro-Wilk Test](./01-data-science.md#shapiro-wilk-test) — full section | [01](./01-data-science.md#shapiro-wilk-test) |
| Levene's Test | [Levene's Test](./01-data-science.md#levenes-test) — full section | [01](./01-data-science.md#levenes-test) |

### Pipelines (sklearn)
- **Status:** ❌ NOT COVERED — needs to be added
- **Target file:** [02-machine-learning.md](./02-machine-learning.md)

### SHAP / LIME
| Concept | Section | File |
|---------|---------|------|
| SHAP | Referenced in [EDA](./01-data-science.md#example-13) example | [01](./01-data-science.md#example-13) |
| LIME | Referenced in [EDA](./01-data-science.md#example-13) example | [01](./01-data-science.md#example-13) |

### Data Science Concepts (Infrastructure)
| Concept | Section | File |
|---------|---------|------|
| Data Engineering vs Data Science | [Data Engineering vs Data Science](./01-data-science.md#data-engineering-vs-data-science) | [01](./01-data-science.md#data-engineering-vs-data-science) |
| Data Warehousing | [Data Warehousing](./01-data-science.md#data-warehousing) | [01](./01-data-science.md#data-warehousing) |
| ETL vs ELT | [ETL vs ELT](./01-data-science.md#etl-vs-elt) | [01](./01-data-science.md#etl-vs-elt) |
| Data Modeling (Star/Snowflake) | [Data Modeling](./01-data-science.md#data-modeling-star-schema-snowflake-schema) | [01](./01-data-science.md#data-modeling-star-schema-snowflake-schema) |
| Data Lake | [Data Lake](./01-data-science.md#data-lake) | [01](./01-data-science.md#data-lake) |
| Data Pipeline | [Data Pipeline](./01-data-science.md#data-pipeline) | [01](./01-data-science.md#data-pipeline) |
| Data Governance | [Data Governance](./01-data-science.md#data-governance) | [01](./01-data-science.md#data-governance) |
| Data Catalog | [Data Catalog](./01-data-science.md#data-catalog) | [01](./01-data-science.md#data-catalog) |
| Data Lineage | [Data Lineage](./01-data-science.md#data-lineage) | [01](./01-data-science.md#data-lineage) |
| Data Quality | [Data Quality](./01-data-science.md#data-quality) | [01](./01-data-science.md#data-quality) |
| Data Versioning | [Data Versioning](./01-data-science.md#data-versioning) | [01](./01-data-science.md#data-versioning) |
| Feature Store | [Feature Store](./01-data-science.md#feature-store) | [01](./01-data-science.md#feature-store) |
| Bias (Data) | [Bias (Data)](./01-data-science.md#bias-data) — full section | [01](./01-data-science.md#bias-data) |
| Data Science Workflow | [Data Science Workflow](./01-data-science.md#data-science-workflow) — full section | [01](./01-data-science.md#data-science-workflow) |

---

## 3. MACHINE LEARNING

### Regression Algorithms
| Concept | Section | File |
|---------|---------|------|
| Linear Regression | [Linear Regression](./02-machine-learning.md#linear-regression) — full section | [02](./02-machine-learning.md#linear-regression) |
| Logistic Regression | [Logistic Regression](./02-machine-learning.md#logistic-regression) — full section | [02](./02-machine-learning.md#logistic-regression) |

### Tree-Based & Ensemble
| Concept | Section | File |
|---------|---------|------|
| Decision Trees | [Decision Trees](./02-machine-learning.md#decision-trees) — full section | [02](./02-machine-learning.md#decision-trees) |
| Random Forest | [Random Forest](./02-machine-learning.md#random-forest) — full section | [02](./02-machine-learning.md#random-forest) |
| XGBoost | [XGBoost](./02-machine-learning.md#xgboost) — full section | [02](./02-machine-learning.md#xgboost) |
| LightGBM | [LightGBM](./02-machine-learning.md#lightgbm) — full section | [02](./02-machine-learning.md#lightgbm) |
| Gradient Boosting (General) | [Gradient Boosting](./02-machine-learning.md#gradient-boosting-general) — full section | [02](./02-machine-learning.md#gradient-boosting-general) |
| Bagging | Referenced in Random Forest section | [02](./02-machine-learning.md#random-forest) |
| Boosting | Referenced in Gradient Boosting section | [02](./02-machine-learning.md#gradient-boosting-general) |
| Stacking | [Stacking](./02-machine-learning.md#stacking) — full section | [02](./02-machine-learning.md#stacking) |

### Other Algorithms
| Concept | Section | File |
|---------|---------|------|
| K-Nearest Neighbors | [K-Nearest Neighbors](./02-machine-learning.md#k-nearest-neighbors) — full section | [02](./02-machine-learning.md#k-nearest-neighbors) |
| SVM | [SVM](./02-machine-learning.md#support-vector-machine-svm) — full section | [02](./02-machine-learning.md#support-vector-machine-svm) |
| Naive Bayes | [Naive Bayes](./02-machine-learning.md#naive-bayes) — full section | [02](./02-machine-learning.md#naive-bayes) |

### Clustering
| Concept | Section | File |
|---------|---------|------|
| K-Means | [K-Means](./02-machine-learning.md#k-means-clustering) — full section | [02](./02-machine-learning.md#k-means-clustering) |
| Hierarchical Clustering | [Hierarchical Clustering](./02-machine-learning.md#hierarchical-clustering) | [02](./02-machine-learning.md#hierarchical-clustering) |
| DBSCAN | [DBSCAN](./02-machine-learning.md#dbscan) | [02](./02-machine-learning.md#dbscan) |

### Dimensionality Reduction
| Concept | Section | File |
|---------|---------|------|
| PCA | [PCA](./02-machine-learning.md#pca-principal-component-analysis) — full section | [02](./02-machine-learning.md#pca-principal-component-analysis) |
| t-SNE | [t-SNE](./02-machine-learning.md#t-sne) — full section | [02](./02-machine-learning.md#t-sne) |

### Anomaly Detection
| Concept | Section | File |
|---------|---------|------|
| Isolation Forest | [Isolation Forest](./02-machine-learning.md#isolation-forest) — full section | [02](./02-machine-learning.md#isolation-forest) |

### Regularization
| Concept | Section | File |
|---------|---------|------|
| L1 (Lasso) | Referenced in [XGBoost](./02-machine-learning.md#xgboost) and [Gradient Boosting](./02-machine-learning.md#gradient-boosting-general) | [02](./02-machine-learning.md#xgboost) |
| L2 (Ridge) | Referenced in [XGBoost](./02-machine-learning.md#xgboost) and [Gradient Boosting](./02-machine-learning.md#gradient-boosting-general) | [02](./02-machine-learning.md#xgboost) |
| Elastic Net | Referenced in context | [02](./02-machine-learning.md) |
| Gini Impurity | [Decision Trees](./02-machine-learning.md#decision-trees) — Theory & Explanation | [02](./02-machine-learning.md#decision-trees) |
| Entropy | [Decision Trees](./02-machine-learning.md#decision-trees) — Theory & Explanation | [02](./02-machine-learning.md#decision-trees) |

### Early Stopping
| Concept | Section | File |
|---------|---------|------|
| Early Stopping | Covered in [XGBoost](./02-machine-learning.md#xgboost), [Gradient Boosting](./02-machine-learning.md#gradient-boosting-general) interview questions | [02](./02-machine-learning.md#xgboost) |

### Hyperparameter Tuning
| Concept | Section | File |
|---------|---------|------|
| Grid Search, Random, Bayesian | [Hyperparameter Tuning](./02-machine-learning.md#hyperparameter-tuning) — full section | [02](./02-machine-learning.md#hyperparameter-tuning) |
| Learning Curve | [Learning Curve](./02-machine-learning.md#learning-curve) — full section | [02](./02-machine-learning.md#learning-curve) |

### Evaluation Metrics
| Concept | Section | File |
|---------|---------|------|
| Confusion Matrix | Referenced in [Evaluation Metrics](./02-machine-learning.md#evaluation-metrics-classification--regression) Example | [02](./02-machine-learning.md#evaluation-metrics-classification--regression) |
| Accuracy, Precision, Recall, F1 | [Evaluation Metrics](./02-machine-learning.md#evaluation-metrics-classification--regression) — full section | [02](./02-machine-learning.md#evaluation-metrics-classification--regression) |
| ROC Curve / AUC | [Evaluation Metrics](./02-machine-learning.md#evaluation-metrics-classification--regression) — full section | [02](./02-machine-learning.md#evaluation-metrics-classification--regression) |
| PR Curve / AUC-PR | [Evaluation Metrics](./02-machine-learning.md#evaluation-metrics-classification--regression) — full section | [02](./02-machine-learning.md#evaluation-metrics-classification--regression) |
| MSE, RMSE, MAE | [Evaluation Metrics](./02-machine-learning.md#evaluation-metrics-classification--regression) — Example with loan default | [02](./02-machine-learning.md#evaluation-metrics-classification--regression) |
| R², Adjusted R² | [Linear Regression](./02-machine-learning.md#linear-regression) — assumptions discussion | [02](./02-machine-learning.md#linear-regression) |
| Log Loss | [Log Loss](./02-machine-learning.md#log-loss) — full section | [02](./02-machine-learning.md#log-loss) |

---

## 4. DEEP LEARNING

### Core Concepts
| Concept | Section | File |
|---------|---------|------|
| Neuron, Layer, Feedforward | [Neural Networks](./03-deep-learning-and-nlp.md#neural-networks-neuron-layer-feedforward) | [03](./03-deep-learning-and-nlp.md#neural-networks-neuron-layer-feedforward) |
| Activation Functions | [Activation Functions](./03-deep-learning-and-nlp.md#activation-functions) — full section | [03](./03-deep-learning-and-nlp.md#activation-functions) |
| ReLU | [Activation Functions](./03-deep-learning-and-nlp.md#activation-functions) — Theory | [03](./03-deep-learning-and-nlp.md#activation-functions) |
| Leaky ReLU | [Activation Functions](./03-deep-learning-and-nlp.md#activation-functions) — Theory | [03](./03-deep-learning-and-nlp.md#activation-functions) |
| Sigmoid, Tanh, Softmax | [Activation Functions](./03-deep-learning-and-nlp.md#activation-functions) — full section | [03](./03-deep-learning-and-nlp.md#activation-functions) |
| Backpropagation | [Backpropagation](./03-deep-learning-and-nlp.md#backpropagation) — full section | [03](./03-deep-learning-and-nlp.md#backpropagation) |
| Loss Function | Cross-entropy, MSE — referenced in backpropagation | [03](./03-deep-learning-and-nlp.md#backpropagation) |
| Optimizer (SGD, Adam, RMSProp) | [Optimizer](./03-deep-learning-and-nlp.md#optimizer) — full section | [03](./03-deep-learning-and-nlp.md#optimizer) |
| Learning Rate | [Learning Rate](./03-deep-learning-and-nlp.md#learning-rate) — full section | [03](./03-deep-learning-and-nlp.md#learning-rate) |
| Learning Rate Scheduler | [Learning Rate Scheduler](./03-deep-learning-and-nlp.md#learning-rate-scheduler) | [03](./03-deep-learning-and-nlp.md#learning-rate-scheduler) |
| Epoch & Batch | [Epoch & Batch](./03-deep-learning-and-nlp.md#epoch--batch) — full section | [03](./03-deep-learning-and-nlp.md#epoch--batch) |
| Gradient Descent Variants | [Gradient Descent Variants](./03-deep-learning-and-nlp.md#gradient-descent-variants) | [03](./03-deep-learning-and-nlp.md#gradient-descent-variants) |
| Vanishing / Exploding Gradient | Referenced in [Backpropagation](./03-deep-learning-and-nlp.md#backpropagation) interview | [03](./03-deep-learning-and-nlp.md#backpropagation) |
| Dropout | [Dropout](./03-deep-learning-and-nlp.md#dropout) — full section | [03](./03-deep-learning-and-nlp.md#dropout) |
| Batch Normalization | [Batch Normalization](./03-deep-learning-and-nlp.md#batch-normalization) | [03](./03-deep-learning-and-nlp.md#batch-normalization) |
| Layer Normalization | [Layer Normalization](./03-deep-learning-and-nlp.md#layer-normalization) | [03](./03-deep-learning-and-nlp.md#layer-normalization) |
| Weight Initialization (Xavier/He) | [Weight Initialization](./03-deep-learning-and-nlp.md#weight-initialization) | [03](./03-deep-learning-and-nlp.md#weight-initialization) |
| Data Augmentation | [Data Augmentation](./03-deep-learning-and-nlp.md#data-augmentation) | [03](./03-deep-learning-and-nlp.md#data-augmentation) |
| Transfer Learning | [Transfer Learning](./03-deep-learning-and-nlp.md#transfer-learning) — full section | [03](./03-deep-learning-and-nlp.md#transfer-learning) |

### Architectures
| Concept | Section | File |
|---------|---------|------|
| CNN | [CNN](./03-deep-learning-and-nlp.md#cnn-convolutional-neural-network) — full section | [03](./03-deep-learning-and-nlp.md#cnn-convolutional-neural-network) |
| RNN | [RNN & LSTM](./03-deep-learning-and-nlp.md#rnn--lstm) — full section | [03](./03-deep-learning-and-nlp.md#rnn--lstm) |
| LSTM | [RNN & LSTM](./03-deep-learning-and-nlp.md#rnn--lstm) — full section | [03](./03-deep-learning-and-nlp.md#rnn--lstm) |
| GRU | [Sequence Models](./03-deep-learning-and-nlp.md#sequence-models-rnnlstmgruattentiontransformer) | [03](./03-deep-learning-and-nlp.md#sequence-models-rnnlstmgruattentiontransformer) |
| Bidirectional RNN | [Sequence Models](./03-deep-learning-and-nlp.md#sequence-models-rnnlstmgruattentiontransformer) | [03](./03-deep-learning-and-nlp.md#sequence-models-rnnlstmgruattentiontransformer) |
| Encoder-Decoder | [Machine Translation](./03-deep-learning-and-nlp.md#machine-translation) — Seq2Seq context | [03](./03-deep-learning-and-nlp.md#machine-translation) |
| Attention | [Transformers](./03-deep-learning-and-nlp.md#transformers) — full section | [03](./03-deep-learning-and-nlp.md#transformers) |
| Transformer | [Transformers](./03-deep-learning-and-nlp.md#transformers) — full section | [03](./03-deep-learning-and-nlp.md#transformers) |
| Autoencoder | [Autoencoder](./03-deep-learning-and-nlp.md#autoencoder) — full section | [03](./03-deep-learning-and-nlp.md#autoencoder) |
| GAN | [GAN](./03-deep-learning-and-nlp.md#gan-generative-adversarial-network) — full section | [03](./03-deep-learning-and-nlp.md#gan-generative-adversarial-network) |
| ResNet | [ResNet](./03-deep-learning-and-nlp.md#resnet) — full section | [03](./03-deep-learning-and-nlp.md#resnet) |
| U-Net | [U-Net](./03-deep-learning-and-nlp.md#u-net) — full section | [03](./03-deep-learning-and-nlp.md#u-net) |

---

## 5. NATURAL LANGUAGE PROCESSING

### Preprocessing
| Concept | Section | File |
|---------|---------|------|
| Tokenization | [Tokenization](./03-deep-learning-and-nlp.md#tokenization) — full section | [03](./03-deep-learning-and-nlp.md#tokenization) |
| BPE | [Tokenization](./03-deep-learning-and-nlp.md#tokenization) — Theory | [03](./03-deep-learning-and-nlp.md#tokenization) |
| WordPiece | [Tokenization](./03-deep-learning-and-nlp.md#tokenization) — Theory | [03](./03-deep-learning-and-nlp.md#tokenization) |
| SentencePiece | [Tokenization](./03-deep-learning-and-nlp.md#tokenization) — Theory | [03](./03-deep-learning-and-nlp.md#tokenization) |
| Stop Words, Stemming, Lemmatization | Referenced in Text Preprocessing context | [03](./03-deep-learning-and-nlp.md) |
| Bag of Words / TF-IDF | [Bag of Words & TF-IDF](./03-deep-learning-and-nlp.md#bag-of-words--tf-idf) | [03](./03-deep-learning-and-nlp.md#bag-of-words--tf-idf) |
| N-grams | [Bag of Words & TF-IDF](./03-deep-learning-and-nlp.md#bag-of-words--tf-idf) — Theory | [03](./03-deep-learning-and-nlp.md#bag-of-words--tf-idf) |

### Word & Sentence Embeddings
| Concept | Section | File |
|---------|---------|------|
| Word Embeddings | [Word Embeddings](./03-deep-learning-and-nlp.md#word-embeddings) — full section | [03](./03-deep-learning-and-nlp.md#word-embeddings) |
| Word2Vec (CBOW/Skip-gram) | [Word Embeddings](./03-deep-learning-and-nlp.md#word-embeddings) — full section | [03](./03-deep-learning-and-nlp.md#word-embeddings) |
| GloVe | [Word Embeddings](./03-deep-learning-and-nlp.md#word-embeddings) — full section | [03](./03-deep-learning-and-nlp.md#word-embeddings) |
| FastText | [Word Embeddings](./03-deep-learning-and-nlp.md#word-embeddings) — full section | [03](./03-deep-learning-and-nlp.md#word-embeddings) |
| Sentence Embeddings | [Sentence Embeddings](./03-deep-learning-and-nlp.md#sentence-embeddings) — full section | [03](./03-deep-learning-and-nlp.md#sentence-embeddings) |
| Cosine Similarity | [Cosine Similarity](./03-deep-learning-and-nlp.md#cosine-similarity) — full section | [03](./03-deep-learning-and-nlp.md#cosine-similarity) |
| Bi-encoder vs Cross-encoder | [Bi-encoder vs Cross-encoder](./03-deep-learning-and-nlp.md#bi-encoder-vs-cross-encoder) | [03](./03-deep-learning-and-nlp.md#bi-encoder-vs-cross-encoder) |

### Pre-trained Language Models
| Concept | Section | File |
|---------|---------|------|
| BERT | [BERT & Pre-trained Language Models](./03-deep-learning-and-nlp.md#bert--pre-trained-language-models) | [03](./03-deep-learning-and-nlp.md#bert--pre-trained-language-models) |
| RoBERTa | [Pre-trained Language Models Comparison](./03-deep-learning-and-nlp.md#pre-trained-language-models-comparison) | [03](./03-deep-learning-and-nlp.md#pre-trained-language-models-comparison) |
| DistilBERT, ALBERT | [ALBERT](./03-deep-learning-and-nlp.md#albert) — full section | [03](./03-deep-learning-and-nlp.md#albert) |
| GPT | [Pre-trained Language Models Comparison](./03-deep-learning-and-nlp.md#pre-trained-language-models-comparison) | [03](./03-deep-learning-and-nlp.md#pre-trained-language-models-comparison) |
| T5, BART, XLNet | [Pre-trained Language Models Comparison](./03-deep-learning-and-nlp.md#pre-trained-language-models-comparison) | [03](./03-deep-learning-and-nlp.md#pre-trained-language-models-comparison) |
| Masked Language Model | [BERT & Pre-trained Language Models](./03-deep-learning-and-nlp.md#bert--pre-trained-language-models) | [03](./03-deep-learning-and-nlp.md#bert--pre-trained-language-models) |
| Autoregressive | [Pre-trained Language Models Comparison](./03-deep-learning-and-nlp.md#pre-trained-language-models-comparison) | [03](./03-deep-learning-and-nlp.md#pre-trained-language-models-comparison) |
| Self-Attention | [Transformers](./03-deep-learning-and-nlp.md#transformers) — Theory | [03](./03-deep-learning-and-nlp.md#transformers) |
| Multi-Head Attention | [Transformers](./03-deep-learning-and-nlp.md#transformers) — Theory | [03](./03-deep-learning-and-nlp.md#transformers) |
| Positional Encoding | [Transformers](./03-deep-learning-and-nlp.md#transformers) — Theory | [03](./03-deep-learning-and-nlp.md#transformers) |

### NLP Tasks
| Concept | Section | File |
|---------|---------|------|
| NER | [NER](./03-deep-learning-and-nlp.md#ner-named-entity-recognition) — full section | [03](./03-deep-learning-and-nlp.md#ner-named-entity-recognition) |
| POS Tagging | [POS Tagging](./03-deep-learning-and-nlp.md#pos-tagging) — full section | [03](./03-deep-learning-and-nlp.md#pos-tagging) |
| Sentiment Analysis | [Sentiment Analysis](./03-deep-learning-and-nlp.md#sentiment-analysis) — full section | [03](./03-deep-learning-and-nlp.md#sentiment-analysis) |
| Text Classification | [Text Classification](./03-deep-learning-and-nlp.md#text-classification) — full section | [03](./03-deep-learning-and-nlp.md#text-classification) |
| Machine Translation | [Machine Translation](./03-deep-learning-and-nlp.md#machine-translation) — full section | [03](./03-deep-learning-and-nlp.md#machine-translation) |
| Text Summarization | [Text Summarization](./03-deep-learning-and-nlp.md#text-summarization) — full section | [03](./03-deep-learning-and-nlp.md#text-summarization) |
| Question Answering | [Question Answering](./03-deep-learning-and-nlp.md#question-answering) — full section | [03](./03-deep-learning-and-nlp.md#question-answering) |

### NLP Evaluation
| Concept | Section | File |
|---------|---------|------|
| Perplexity | [Perplexity](./03-deep-learning-and-nlp.md#perplexity-nlp) — full section | [03](./03-deep-learning-and-nlp.md#perplexity-nlp) |
| BLEU, ROUGE, METEOR | [05-llm-rag-graph.md](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) — interview questions | [05](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) |
| BLEURT | [05-llm-rag-graph.md](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) | [05](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) |

---

## 6. LLMs (Large Language Models)

| Concept | Section | File |
|---------|---------|------|
| LLM Definition | [LLMs](./05-llm-rag-graph.md#llms-large-language-models) — Theory | [05](./05-llm-rag-graph.md#llms-large-language-models) |
| Foundation Model | [LLMs](./05-llm-rag-graph.md#llms-large-language-models) — Theory | [05](./05-llm-rag-graph.md#llms-large-language-models) |
| Pre-training | [LLMs](./05-llm-rag-graph.md#llms-large-language-models) — Theory | [05](./05-llm-rag-graph.md#llms-large-language-models) |
| Fine-tuning | [Fine-tuning & Adaptation Methods](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) | [05](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) |
| Instruction Tuning | [Additional LLM Concepts](./05-llm-rag-graph.md#additional-llm-concepts) — Interview Qs | [05](./05-llm-rag-graph.md#additional-llm-concepts) |
| RLHF | [Fine-tuning & Adaptation Methods](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) — Interview Qs (line 238) | [05](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) |
| DPO | [Fine-tuning & Adaptation Methods](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) — Theory | [05](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) |
| SFT | [Fine-tuning & Adaptation Methods](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) — Example | [05](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) |
| ORPO | [Fine-tuning & Adaptation Methods](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) — Theory | [05](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) |
| Emergent Abilities | [LLMs](./05-llm-rag-graph.md#llms-large-language-models) — Theory (line 10) | [05](./05-llm-rag-graph.md#llms-large-language-models) |
| In-Context Learning | [Prompt Engineering](./05-llm-rag-graph.md#prompt-engineering) — Theory | [05](./05-llm-rag-graph.md#prompt-engineering) |
| Zero-shot / Few-shot | [Prompt Engineering](./05-llm-rag-graph.md#prompt-engineering) — Theory | [05](./05-llm-rag-graph.md#prompt-engineering) |
| Chain-of-Thought (CoT) | [Prompt Engineering](./05-llm-rag-graph.md#prompt-engineering) — Theory + Interview Qs | [05](./05-llm-rag-graph.md#prompt-engineering) |
| Self-Consistency | [Prompt Engineering](./05-llm-rag-graph.md#prompt-engineering) — Theory | [05](./05-llm-rag-graph.md#prompt-engineering) |
| Tree-of-Thoughts (ToT) | [Prompt Engineering](./05-llm-rag-graph.md#prompt-engineering) — Theory | [05](./05-llm-rag-graph.md#prompt-engineering) |
| ReAct | [Agents & Tool Use](./05-llm-rag-graph.md#agents--tool-use) — Theory | [05](./05-llm-rag-graph.md#agents--tool-use) |
| Context Window | [LLMs](./05-llm-rag-graph.md#llms-large-language-models) — Theory | [05](./05-llm-rag-graph.md#llms-large-language-models) |
| Hallucination | [Evaluation & Hallucination](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) — full section | [05](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) |
| Scaling Laws (Kaplan, Chinchilla) | [LLMs](./05-llm-rag-graph.md#llms-large-language-models) — Theory | [05](./05-llm-rag-graph.md#llms-large-language-models) |
| Temperature, Top-p, Top-k | [LLMs](./05-llm-rag-graph.md#llms-large-language-models) — Example | [05](./05-llm-rag-graph.md#llms-large-language-models) |
| Logit Bias, Beam Search | [Additional LLM Concepts](./05-llm-rag-graph.md#additional-llm-concepts) | [05](./05-llm-rag-graph.md#additional-llm-concepts) |

### LLM Inference & Deployment
| Concept | Section | File |
|---------|---------|------|
| KV Cache | Referenced briefly in [LLMs](./05-llm-rag-graph.md#llms-large-language-models) line 16 | [05](./05-llm-rag-graph.md#llms-large-language-models) |
| Speculative Decoding | Referenced briefly in [LLMs](./05-llm-rag-graph.md#llms-large-language-models) line 16 | [05](./05-llm-rag-graph.md#llms-large-language-models) |
| Quantization (GPTQ, AWQ, GGUF) | [LLMs](./05-llm-rag-graph.md#llms-large-language-models) — Theory (line 16) | [05](./05-llm-rag-graph.md#llms-large-language-models) |

### LLM Architectures
| Model | Section | File |
|-------|---------|------|
| GPT-4, Claude, LLaMA, Mistral, Gemini | [LLMs](./05-llm-rag-graph.md#llms-large-language-models) — Example table | [05](./05-llm-rag-graph.md#llms-large-language-models) |
| Decoding Strategies | [LLMs](./05-llm-rag-graph.md#llms-large-language-models) — Example table | [05](./05-llm-rag-graph.md#llms-large-language-models) |

---

## 7. RAG (Retrieval-Augmented Generation)

| Concept | Section | File |
|---------|---------|------|
| RAG Definition | [RAG](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) — full section | [05](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) |
| Retriever (Sparse/Dense) | [RAG](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) — Theory | [05](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) |
| Generator | [RAG](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) — Theory | [05](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) |
| Indexing | [RAG](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) — Theory | [05](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) |
| Chunking / Chunk Overlap | [Additional RAG Concepts](./05-llm-rag-graph.md#additional-rag-concepts) | [05](./05-llm-rag-graph.md#additional-rag-concepts) |
| Embedding Model | [RAG](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) — Theory | [05](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) |
| Vector Database | [RAG](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) — Theory | [05](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) |
| ANN (HNSW, IVF, LSH) | [Additional RAG Concepts](./05-llm-rag-graph.md#additional-rag-concepts) | [05](./05-llm-rag-graph.md#additional-rag-concepts) |
| Similarity Search | [RAG](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) — Theory | [05](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) |
| Metadata Filtering | [RAG](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) — Example | [05](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) |
| Hybrid Search | [RAG](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) — Theory | [05](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) |
| BM25 | [RAG](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) — Theory | [05](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) |
| Reciprocal Rank Fusion (RRF) | [Additional RAG Concepts](./05-llm-rag-graph.md#additional-rag-concepts) | [05](./05-llm-rag-graph.md#additional-rag-concepts) |
| Query Rewriting / Expansion | [Additional RAG Concepts](./05-llm-rag-graph.md#additional-rag-concepts) | [05](./05-llm-rag-graph.md#additional-rag-concepts) |
| HyDE | [Additional RAG Concepts](./05-llm-rag-graph.md#additional-rag-concepts) | [05](./05-llm-rag-graph.md#additional-rag-concepts) |
| Context Window Management | [RAG](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) — Theory | [05](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) |
| Sliding Window / Parent Document Retriever | [Additional RAG Concepts](./05-llm-rag-graph.md#additional-rag-concepts) | [05](./05-llm-rag-graph.md#additional-rag-concepts) |
| RAPTOR | [Additional RAG Concepts](./05-llm-rag-graph.md#additional-rag-concepts) | [05](./05-llm-rag-graph.md#additional-rag-concepts) |
| Re-ranking | [RAG](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) — Theory | [05](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) |
| Contextual Compression | [Additional RAG Concepts](./05-llm-rag-graph.md#additional-rag-concepts) | [05](./05-llm-rag-graph.md#additional-rag-concepts) |
| Self-RAG, CRAG, Agentic RAG, Graph RAG | [Additional RAG Concepts](./05-llm-rag-graph.md#additional-rag-concepts) | [05](./05-llm-rag-graph.md#additional-rag-concepts) |
| Modular RAG, FLARE | [Additional RAG Concepts](./05-llm-rag-graph.md#additional-rag-concepts) | [05](./05-llm-rag-graph.md#additional-rag-concepts) |
| RAG Pipeline Diagram | [RAG](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) — Theory | [05](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) |
| RAG vs Fine-tuning vs Prompt Engineering | [RAG](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) — Example table | [05](./05-llm-rag-graph.md#rag-retrieval-augmented-generation) |
| RAG Failure Modes & Fixes | [Additional RAG Concepts](./05-llm-rag-graph.md#additional-rag-concepts) | [05](./05-llm-rag-graph.md#additional-rag-concepts) |

---

## 8. PROMPT ENGINEERING

| Concept | Section | File |
|---------|---------|------|
| System / User Prompt | [Prompt Engineering](./05-llm-rag-graph.md#prompt-engineering) — Theory | [05](./05-llm-rag-graph.md#prompt-engineering) |
| Few-shot / Zero-shot Prompting | [Prompt Engineering](./05-llm-rag-graph.md#prompt-engineering) — Theory | [05](./05-llm-rag-graph.md#prompt-engineering) |
| Chain-of-Thought (CoT) | [Prompt Engineering](./05-llm-rag-graph.md#prompt-engineering) — Theory + Interview | [05](./05-llm-rag-graph.md#prompt-engineering) |
| Zero-shot CoT | [Prompt Engineering](./05-llm-rag-graph.md#prompt-engineering) — Theory | [05](./05-llm-rag-graph.md#prompt-engineering) |
| Self-Consistency | [Prompt Engineering](./05-llm-rag-graph.md#prompt-engineering) — Theory | [05](./05-llm-rag-graph.md#prompt-engineering) |
| Role / Negative / Delimiter Prompting | [Additional Prompt Engineering](./05-llm-rag-graph.md#additional-prompt-engineering) | [05](./05-llm-rag-graph.md#additional-prompt-engineering) |
| Structured Output | [Additional Prompt Engineering](./05-llm-rag-graph.md#additional-prompt-engineering) | [05](./05-llm-rag-graph.md#additional-prompt-engineering) |
| ReAct (Reasoning + Acting) | [Agents & Tool Use](./05-llm-rag-graph.md#agents--tool-use) — Theory | [05](./05-llm-rag-graph.md#agents--tool-use) |
| Tree-of-Thoughts (ToT) | [Prompt Engineering](./05-llm-rag-graph.md#prompt-engineering) — Theory | [05](./05-llm-rag-graph.md#prompt-engineering) |
| APE (Automatic Prompt Engineer) | [Additional Prompt Engineering](./05-llm-rag-graph.md#additional-prompt-engineering) | [05](./05-llm-rag-graph.md#additional-prompt-engineering) |
| Prompt Chaining | [Additional Prompt Engineering](./05-llm-rag-graph.md#additional-prompt-engineering) | [05](./05-llm-rag-graph.md#additional-prompt-engineering) |
| Best Practices & Templates | [Prompt Engineering](./05-llm-rag-graph.md#prompt-engineering) — Theory | [05](./05-llm-rag-graph.md#prompt-engineering) |

---

## 9. AGENTS & TOOL USE

| Concept | Section | File |
|---------|---------|------|
| Agent Definition | [Agents & Tool Use](./05-llm-rag-graph.md#agents--tool-use) — full section | [05](./05-llm-rag-graph.md#agents--tool-use) |
| Tool / Function Calling | [Agents & Tool Use](./05-llm-rag-graph.md#agents--tool-use) — Theory | [05](./05-llm-rag-graph.md#agents--tool-use) |
| Memory (Short/Long-term) | [Additional Agent Concepts](./05-llm-rag-graph.md#additional-agent-concepts) | [05](./05-llm-rag-graph.md#additional-agent-concepts) |
| Planning | [Agents & Tool Use](./05-llm-rag-graph.md#agents--tool-use) — Theory | [05](./05-llm-rag-graph.md#agents--tool-use) |
| ReAct Agent | [Agents & Tool Use](./05-llm-rag-graph.md#agents--tool-use) — Theory | [05](./05-llm-rag-graph.md#agents--tool-use) |
| Plan-and-Execute | [Agents & Tool Use](./05-llm-rag-graph.md#agents--tool-use) — Theory | [05](./05-llm-rag-graph.md#agents--tool-use) |
| Reflection / Self-Evaluation | [Additional Agent Concepts](./05-llm-rag-graph.md#additional-agent-concepts) | [05](./05-llm-rag-graph.md#additional-agent-concepts) |
| Multi-agent / Orchestrator / Router | [Additional Agent Concepts](./05-llm-rag-graph.md#additional-agent-concepts) | [05](./05-llm-rag-graph.md#additional-agent-concepts) |
| Guardrails | [Agents & Tool Use](./05-llm-rag-graph.md#agents--tool-use) — Theory | [05](./05-llm-rag-graph.md#agents--tool-use) |
| Human-in-the-Loop | Referenced in [Agents & Tool Use](./05-llm-rag-graph.md#agents--tool-use) — Example | [05](./05-llm-rag-graph.md#agents--tool-use) |
| Autonomous / Semi-autonomous Agent | [Additional Agent Concepts](./05-llm-rag-graph.md#additional-agent-concepts) | [05](./05-llm-rag-graph.md#additional-agent-concepts) |
| Agent Architecture Diagram | [Agents & Tool Use](./05-llm-rag-graph.md#agents--tool-use) — Theory | [05](./05-llm-rag-graph.md#agents--tool-use) |
| LangGraph, LangChain, AutoGen, CrewAI | [Additional Agent Concepts](./05-llm-rag-graph.md#additional-agent-concepts) | [05](./05-llm-rag-graph.md#additional-agent-concepts) |

---

## 10. GRAPH-BASED ML & KNOWLEDGE GRAPHS

| Concept | Section | File |
|---------|---------|------|
| Graph / Node / Edge | [Graph-Based ML & Knowledge Graphs](./05-llm-rag-graph.md#graph-based-ml--knowledge-graphs) | [05](./05-llm-rag-graph.md#graph-based-ml--knowledge-graphs) |
| Directed / Undirected / Weighted | [Additional Graph ML & KG Concepts](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) | [05](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) |
| Adjacency Matrix / Degree | [Additional Graph ML & KG Concepts](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) | [05](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) |
| Knowledge Graph (KG) | [Graph-Based ML & Knowledge Graphs](./05-llm-rag-graph.md#graph-based-ml--knowledge-graphs) — full section | [05](./05-llm-rag-graph.md#graph-based-ml--knowledge-graphs) |
| Triple (S-P-O) / SPARQL / RDF / OWL | [Additional Graph ML & KG Concepts](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) | [05](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) |
| Node Embedding / Graph Embedding | [Additional Graph ML & KG Concepts](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) | [05](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) |
| DeepWalk / Node2Vec | [Additional Graph ML & KG Concepts](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) | [05](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) |
| GNN / GCN / GAT / GraphSAGE | [Graph-Based ML & Knowledge Graphs](./05-llm-rag-graph.md#graph-based-ml--knowledge-graphs) — Theory | [05](./05-llm-rag-graph.md#graph-based-ml--knowledge-graphs) |
| Message Passing | [Graph-Based ML & Knowledge Graphs](./05-llm-rag-graph.md#graph-based-ml--knowledge-graphs) — Theory | [05](./05-llm-rag-graph.md#graph-based-ml--knowledge-graphs) |
| Graph Transformer / RGCN | [Additional Graph ML & KG Concepts](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) | [05](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) |
| KGE (TransE, RotatE, ComplEx) | [Additional Graph ML & KG Concepts](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) | [05](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) |
| Link Prediction / Node / Graph Classification | [Additional Graph ML & KG Concepts](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) | [05](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) |
| WL Test / Homophily / Heterophily | [Additional Graph ML & KG Concepts](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) | [05](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) |
| Neo4j / Cypher / PageRank | [Additional Graph ML & KG Concepts](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) | [05](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) |
| Community Detection | [Additional Graph ML & KG Concepts](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) | [05](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) |
| GraphRAG | [Graph-Based ML & Knowledge Graphs](./05-llm-rag-graph.md#graph-based-ml--knowledge-graphs) — Theory + detailed pipeline | [05](./05-llm-rag-graph.md#graph-based-ml--knowledge-graphs) |
| GoT (Graph-of-Thoughts) | [Additional Graph ML & KG Concepts](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) | [05](./05-llm-rag-graph.md#additional-graph-ml--kg-concepts) |

---

## 11. FINE-TUNING & ADAPTATION METHODS

| Concept | Section | File |
|---------|---------|------|
| Full Fine-tuning | [Fine-tuning & Adaptation Methods](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) | [05](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) |
| LoRA | [Fine-tuning & Adaptation Methods](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) — Theory | [05](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) |
| QLoRA | [Fine-tuning & Adaptation Methods](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) — full Example | [05](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) |
| DoRA, Adapter, Prefix Tuning, Prompt Tuning | [Additional Fine-Tuning Concepts](./05-llm-rag-graph.md#additional-fine-tuning-concepts) | [05](./05-llm-rag-graph.md#additional-fine-tuning-concepts) |
| P-Tuning v2, IA³ | [Additional Fine-Tuning Concepts](./05-llm-rag-graph.md#additional-fine-tuning-concepts) | [05](./05-llm-rag-graph.md#additional-fine-tuning-concepts) |
| Catastrophic Forgetting | [Additional Fine-Tuning Concepts](./05-llm-rag-graph.md#additional-fine-tuning-concepts) | [05](./05-llm-rag-graph.md#additional-fine-tuning-concepts) |
| Multi-task Fine-tuning / Domain Adaptation | [Additional Fine-Tuning Concepts](./05-llm-rag-graph.md#additional-fine-tuning-concepts) | [05](./05-llm-rag-graph.md#additional-fine-tuning-concepts) |
| DPO / ORPO | [Fine-tuning & Adaptation Methods](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) — Theory | [05](./05-llm-rag-graph.md#fine-tuning--adaptation-methods) |
| Parameter Efficiency Comparison Table | [Additional Fine-Tuning Concepts](./05-llm-rag-graph.md#additional-fine-tuning-concepts) | [05](./05-llm-rag-graph.md#additional-fine-tuning-concepts) |

---

## 12. EVALUATION & HALLUCINATION IN LLMs

| Concept | Section | File |
|---------|---------|------|
| BLEU, ROUGE, METEOR, BLEURT | [Evaluation & Hallucination](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) — Interview Qs | [05](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) |
| Perplexity | [Perplexity](./03-deep-learning-and-nlp.md#perplexity-nlp) — full section | [03](./03-deep-learning-and-nlp.md#perplexity-nlp) |
| Factual Consistency / Faithfulness | [Evaluation & Hallucination](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) — Theory | [05](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) |
| Hallucination (Intrinsic/Extrinsic) | [Evaluation & Hallucination](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) — Theory | [05](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) |
| G-Eval | [Evaluation & Hallucination](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) — Theory | [05](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) |
| LLM-as-Judge | [Evaluation & Hallucination](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) — Theory | [05](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) |
| Pairwise / Human / A/B Evaluation | [Evaluation & Hallucination](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) — Theory | [05](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) |
| RAGAS (Context Precision/Recall, Faithfulness, Answer Relevancy) | [Evaluation & Hallucination](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) — full Theory | [05](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) |
| ARES, TruLens | [Additional Evaluation Concepts](./05-llm-rag-graph.md#additional-evaluation--hallucination-concepts) | [05](./05-llm-rag-graph.md#additional-evaluation--hallucination-concepts) |
| LangSmith / LangFuse | [Agents & Tool Use](./05-llm-rag-graph.md#agents--tool-use) — Interview Qs + [Evaluation](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) | [05](./05-llm-rag-graph.md#agents--tool-use) |
| Hallucination Detection (SelfCheckGPT, NLI, Semantic Entropy) | [Evaluation & Hallucination](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) — Theory | [05](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) |
| Quick Comparison: Which to Use When | [Evaluation & Hallucination](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) — Example | [05](./05-llm-rag-graph.md#evaluation--hallucination-in-llms) |

---

## 13. TRANSFORMERS, LLMs & FINE-TUNING — FOUNDATIONAL DEEP DIVE

*This section covers the foundational deep-dive content in [06-transformers-llm-finetuning.md](./06-transformers-llm-finetuning.md), which expands on topics introduced in files 03 and 05 with greater theoretical depth and practical detail.*

| Concept | Section | File |
|---------|---------|------|
| Transformer Architecture Families (Encoder-only vs Decoder-only vs Encoder-Decoder) | [Transformer Architecture Families](./06-transformers-llm-finetuning.md#transformer-architecture-families) | [06](./06-transformers-llm-finetuning.md#transformer-architecture-families) |
| LLM Training Pipeline (Pre-train → SFT → Preference Optimization) | [LLM Training Pipeline](./06-transformers-llm-finetuning.md#llm-training-pipeline) | [06](./06-transformers-llm-finetuning.md#llm-training-pipeline) |
| Base Model vs Instruct/Chat Model | [Base Model vs Instruct/Chat Model](./06-transformers-llm-finetuning.md#base-model-vs-instructchat-model) | [06](./06-transformers-llm-finetuning.md#base-model-vs-instructchat-model) |
| Prompt Templates & Chat Formats (ChatML, LLaMA 3, Mistral, Alpaca, Phi, Gemma) | [Prompt Templates & Chat Formats](./06-transformers-llm-finetuning.md#prompt-templates--chat-formats) | [06](./06-transformers-llm-finetuning.md#prompt-templates--chat-formats) |
| When to Fine-tune vs RAG vs Prompt Engineering | [When to Fine-tune vs RAG vs Prompt Engineering](./06-transformers-llm-finetuning.md#when-to-fine-tune-vs-rag-vs-prompt-engineering) | [06](./06-transformers-llm-finetuning.md#when-to-fine-tune-vs-rag-vs-prompt-engineering) |
| Instruction Tuning (dataset format, diversity, multi-turn, quality guidelines) | [Instruction Tuning](./06-transformers-llm-finetuning.md#instruction-tuning) | [06](./06-transformers-llm-finetuning.md#instruction-tuning) |
| Full Fine-tuning vs PEFT (LoRA, QLoRA, Adapters, Prefix Tuning, Prompt Tuning) | [Fine-tuning Methods: Full Fine-tuning vs PEFT](./06-transformers-llm-finetuning.md#fine-tuning-methods-full-fine-tuning-vs-peft) | [06](./06-transformers-llm-finetuning.md#fine-tuning-methods-full-fine-tuning-vs-peft) |
| Loss Functions & Training Considerations (cross-entropy, learning rate, batch size, gradient accumulation, overfitting prevention) | [Loss Functions & Training Considerations](./06-transformers-llm-finetuning.md#loss-functions--training-considerations) | [06](./06-transformers-llm-finetuning.md#loss-functions--training-considerations) |
| Evaluation of Fine-tuned Models (task-specific metrics, human eval, LLM-as-judge, A/B testing, catastrophic forgetting eval) | [Evaluation of Fine-tuned Models](./06-transformers-llm-finetuning.md#evaluation-of-fine-tuned-models) | [06](./06-transformers-llm-finetuning.md#evaluation-of-fine-tuned-models) |

---

## Status Legend

| Icon | Meaning |
|------|---------|
| ✅ | Fully covered in existing files |
| 🟡 | Present but scattered / not as dedicated section |
| ❌ | NOT COVERED — needs to be written |

## Missing Concepts (Priority for Addition)

| Concept | Recommended File | Priority |
|---------|-----------------|----------|
| CRISP-DM | [01-data-science.md](./01-data-science.md) | High |
| Cross-Validation (dedicated section) | [02-machine-learning.md](./02-machine-learning.md) | High |
| Stratified Cross-Validation | [02-machine-learning.md](./02-machine-learning.md) | High |
| Bias-Variance Tradeoff (dedicated) | [02-machine-learning.md](./02-machine-learning.md) | High |
| Overfitting (dedicated section) | [02-machine-learning.md](./02-machine-learning.md) | High |
| Underfitting (dedicated section) | [02-machine-learning.md](./02-machine-learning.md) | Medium |
| Feature Selection (dedicated) | [02-machine-learning.md](./02-machine-learning.md) | Medium |
| sklearn Pipelines | [02-machine-learning.md](./02-machine-learning.md) | Medium |
| Confusion Matrix (dedicated section) | [02-machine-learning.md](./02-machine-learning.md) | Medium |
| KV Cache (dedicated section) | [05-llm-rag-graph.md](./05-llm-rag-graph.md) | Low |
| Speculative Decoding (dedicated) | [05-llm-rag-graph.md](./05-llm-rag-graph.md) | Low |
| Human-in-the-Loop (dedicated) | [05-llm-rag-graph.md](./05-llm-rag-graph.md) | Low |
