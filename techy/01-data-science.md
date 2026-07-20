# Data Science — Interview Preparation

---

## Data Engineering vs Data Science

**Definition:** Data Engineering builds the infrastructure to collect, store, and process data at scale; Data Science analyzes that data to extract insights and build models.

### Theory & Explanation

Data Engineering and Data Science are complementary but distinct disciplines. Data Engineering focuses on the architecture, pipelines, and infrastructure that enable data to flow reliably from source systems to storage and compute platforms. Data Engineers build and maintain ETL/ELT pipelines, design data warehouses and data lakes, manage orchestration (Airflow, Prefect), and ensure data quality, scalability, and operational reliability. Their primary output is trustworthy, well-structured data delivered on schedule.

Data Science focuses on extracting insight from data through statistical analysis, hypothesis testing, machine learning, and visualization. Data Scientists explore data, formulate and test hypotheses, build predictive models, design experiments (A/B tests), and communicate findings to stakeholders. Their primary output is analytical insights, models, and data-driven recommendations. While there is overlap in tools (Python, SQL), the orientation differs fundamentally: Data Engineering is systems engineering focused on reliability and scale; Data Science is analytical discovery focused on inference and prediction.

The data science hierarchy of needs makes this relationship explicit: data engineering (infrastructure, pipelines, storage) forms the foundation — without reliable data collection, ingestion, and transformation, no amount of sophisticated modeling produces trustworthy results. A team with excellent data scientists but poor data engineering will struggle with unreliable data, slow iteration cycles, and distrust in model outputs.

| Dimension | Data Engineering | Data Science |
|-----------|-----------------|--------------|
| Primary focus | Infrastructure, pipelines, reliability | Analysis, modeling, inference |
| Key output | Clean, reliable data at scale | Insights, models, recommendations |
| Core skills | Distributed systems, SQL, orchestration, cloud infra | Statistics, ML, experimentation, visualization |
| Typical tools | Airflow, Spark, dbt, Snowflake, Kafka | Python/R, scikit-learn, Jupyter, TensorFlow |
| Stakeholders | Analytics teams, downstream consumers | Business stakeholders, product teams |

### Example

A Data Engineer builds a pipeline that streams clickstream events from a mobile app through Kafka, buffers them in S3, runs Spark transformations for sessionization and enrichment, and loads the result into Redshift. The pipeline runs hourly with automated retry logic, data quality checks, and freshness alerts. A Data Scientist then queries the Redshift tables to build a churn prediction model: they engineer features from the clickstream data (session frequency, time-on-page, feature usage), train an XGBoost classifier, evaluate with precision-recall, and deploy the model to score users daily.

### Interview Questions

**Q: Can a data scientist do data engineering?**
A: Data scientists often handle light data engineering (SQL transformations, basic pipelines), but production-grade data engineering requires deep knowledge of distributed computing, cloud infrastructure, orchestration, error handling, and operational monitoring. A data scientist performing DE tasks at scale typically leads to fragile pipelines, poor performance, and unreliable data delivery. The ideal is collaboration — the DE builds reliable infrastructure that enables the DS to focus on analysis.

**Q: What happens if data engineering infrastructure is poor?**
A: Poor DE infrastructure causes cascading failures: data arrives late or not at all, pipelines break silently, data quality degrades, and dashboards show stale or incorrect numbers. Data scientists waste 60-80% of their time on data cleaning and wrangling instead of analysis. Models trained on unreliable data produce incorrect predictions, eroding stakeholder trust. The root cause is almost never the modeling — it is the data pipeline.

---

## Data Warehousing

**Definition:** Centralized repository for structured, cleansed, integrated data from multiple sources, optimized for query and analysis.

### Theory & Explanation

Data warehousing follows two major architectural philosophies. Kimball (dimensional modeling) advocates a bottom-up approach: build dimensional data marts for individual business processes first, then integrate them into a conformed dimension bus architecture. The core modeling pattern is the **star schema** — a central **fact table** containing quantitative measures and foreign keys to surrounding **dimension tables** with descriptive attributes. Inmon advocates a top-down approach: build a normalized enterprise data warehouse in 3NF first, then derive departmental data marts. Kimball is faster to deliver and more intuitive for business users; Inmon provides a single source of truth but takes longer to build.

**OLAP vs OLTP** is a fundamental distinction. OLTP (Online Transaction Processing) systems handle high-volume, low-latency transactions with row-oriented storage and ACID guarantees — designed for inserts and updates. OLAP (Online Analytical Processing) systems handle complex aggregations over large datasets with column-oriented storage and query optimization — designed for reads and analysis. A data warehouse is an OLAP system.

**Slowly Changing Dimensions (SCDs)** manage how dimension attributes change over time. Type 1 overwrites the old value with the new (no history). Type 2 creates a new row with effective date ranges, preserving full history. Type 3 adds a new column to track the previous value (limited history). Type 2 is most common in analytics. The data warehouse vs data lake vs data lakehouse distinction: data warehouses offer best query performance and governance but require structured schemas; data lakes store raw data cheaply but lack ACID and performance; data lakehouses combine the two with ACID transactions on object storage (Databricks Delta Lake, Iceberg, Hudi).

### Example

A sales data warehouse includes `fact_sales` with columns `sale_id`, `date_key`, `customer_key`, `product_key`, `store_key`, `quantity`, and `amount`. Dimension tables: `dim_customer` (name, address, segment), `dim_product` (name, category, brand, price), `dim_date` (date, day_of_week, month, quarter, year), `dim_store` (name, region, size_sqft). A typical analytical query: "What were total sales by product category per month in Q4 2024?" — joins fact_sales → dim_product → dim_date, groups by category and month, aggregates sum(amount).

### Interview Questions

**Q: Star schema vs snowflake schema — what are the trade-offs?**
A: Star schemas denormalize dimensions into a single table per dimension — simpler, faster queries with fewer joins, but more storage due to redundancy. Snowflake schemas normalize dimensions into sub-dimensions — less storage, better referential integrity, but more joins and slower query performance. Star is preferred for analytics due to simpler query patterns; snowflake is sometimes used when storage costs dominate or when dimensions are deeply hierarchical.

**Q: When would you denormalize a data warehouse?**
A: Denormalization is warranted when query performance is critical and the redundancy cost is acceptable — for example, storing product category name directly in the fact table to avoid a join in every query. It is also common in reporting marts where business users need a flat, wide table they can query directly in BI tools without understanding join semantics.

---

## ETL vs ELT

**Definition:** ETL (Extract, Transform, Load) transforms data before loading; ELT (Extract, Load, Transform) loads raw data first, transforms in the target system.

### Theory & Explanation

ETL is the traditional approach. Data is extracted from source systems, transformed in a staging area (cleansing, validation, deduplication, aggregation, PII removal), and then loaded into the target data warehouse. The transformation step occurs before loading, so the warehouse receives clean, conformed data. ETL provides better **data quality and compliance** because sensitive data (PII, PHI) can be removed or masked before it enters the warehouse. However, ETL is slower (transformation creates a bottleneck), less flexible (transforms are pre-defined and hard to retroactively change), and requires a separate transformation engine (Informatica, Talend, SSIS).

ELT is the modern cloud-native approach made possible by massively parallel processing (MPP) data warehouses (Snowflake, Redshift, BigQuery). Raw data is extracted and loaded directly into the warehouse with minimal transformation. Transformations are applied later using the warehouse's compute engine (SQL, dbt). ELT is **faster** (loading raw data is quick), **more flexible** (raw data is available for reprocessing or new analysis), and **leverages MPP compute** rather than requiring a separate transformation server. ELT is preferred for agile analytics, large data volumes, frequent schema changes, and scenarios where the raw data has ongoing analytical value.

The tool landscape reflects this split. dbt is the dominant ELT transformation tool — analysts write SQL SELECT statements that are materialized as views or tables. Fivetran and Airbyte handle the EL part (extract and load). Traditional ETL tools like Informatica and Talend remain relevant in regulated industries where data must be cleansed before entering any storage.

### Example

A company handling EU customer data uses **ETL for GDPR compliance**: customer names and email addresses are pseudonymized in the staging layer before any data reaches the warehouse. This ensures that even if the warehouse is compromised, raw PII is never exposed. For **advertising analytics**, the same company uses **ELT**: raw clickstream events are loaded into Snowflake as-is, then analysts use dbt to define sessionization, attribution, and aggregation transforms. When a new attribution model is needed, analysts can rebuild transforms against the raw data without re-extracting from source.

### Interview Questions

**Q: Which is better for data quality?**
A: ETL has inherently stronger data quality guarantees because transformation and validation happen before data enters the warehouse — bad data can be rejected, quarantined, or corrected at the staging layer. ELT shifts this responsibility downstream: data quality checks are applied during transformation within the warehouse, which means raw data with quality issues may be loaded and could be consumed by downstream processes before quality checks run. Modern ELT pipelines address this with automated quality testing (dbt tests, Great Expectations) running immediately after load.

**Q: When would you use ETL despite ELT being faster?**
A: Use ETL when: (1) strict regulatory compliance requires data to be anonymized before storage; (2) source systems have limited bandwidth and need transformation to reduce data volume before transfer; (3) the target warehouse charges significant compute costs and pre-transforming reduces storage/processing cost; (4) the transformation engine has capabilities the warehouse cannot match (complex streaming transforms, proprietary libraries); (5) legacy infrastructure predates modern cloud data warehouses.

---

## Data Modeling (Star Schema, Snowflake Schema)

**Definition:** Process of defining how data is structured, connected, and stored. Key schemas for analytics: Star and Snowflake.

### Theory & Explanation

Star Schema is the foundational dimensional modeling pattern. A central **fact table** stores quantitative measures (sales amount, quantity, count) and foreign keys to surrounding **dimension tables**. Dimension tables are **denormalized** — all descriptive attributes for an entity live in a single table. This design makes the schema simple (resembling a star) and queries fast because they require only single-hop joins from fact to dimension. Star schemas are intuitive for business users and perform well in OLAP engines.

Snowflake Schema extends star by **normalizing** dimension tables into sub-dimensions. For example, `dim_product` (product_id, product_name, category_id) joins to `dim_category` (category_id, category_name, department_id), which joins to `dim_department` (department_id, department_name). This reduces data redundancy and improves referential integrity but increases the number of joins required for queries. Snowflake schemas use less storage but can degrade query performance on large datasets.

| Dimension | Star Schema | Snowflake Schema |
|-----------|-------------|------------------|
| Complexity | Simple, single join per dimension | Multiple joins per dimension |
| Query speed | Faster (fewer joins) | Slower (more joins) |
| Storage | Higher (redundant attributes) | Lower (normalized) |
| Maintenance | Update anomalies possible | Better integrity |
| Business user | Easy to understand | More complex |

**Dimensional modeling** differs from **3NF** (Third Normal Form). 3NF removes all redundancy through normalization — it is designed for transactional systems with high write volumes. Dimensional modeling accepts controlled redundancy for query performance and usability. **Slowly changing dimensions** manage how dimension attributes evolve: Type 1 (overwrite), Type 2 (new row with date range), Type 3 (new column for previous value). Type 2 is most common in analytics for accurate historical reporting.

### Example

Star Schema: `dim_product` contains `product_id`, `product_name`, `category_id`, `category_name`, `brand_name` — all in one table. Query: `SELECT SUM(amount) FROM fact_sales JOIN dim_product ON ...` — one join.

Snowflake Schema: `dim_product` contains `product_id`, `product_name`, `category_id`; `dim_category` contains `category_id`, `category_name`, `brand_id`. Query: `SELECT SUM(amount) FROM fact_sales JOIN dim_product ON ... JOIN dim_category ON ... JOIN dim_brand ON ...` — three joins.

### Interview Questions

**Q: Why would you use snowflake over star?**
A: Snowflake is useful when: (1) storage costs are a primary concern (normalization reduces data volume); (2) dimensions have deep hierarchies that are themselves analyzed independently; (3) you need strict referential integrity enforced by the schema; (4) multiple dimensions share sub-dimensions (e.g., customer and employee both reference geography). In practice, most production data warehouses use star schemas because query performance matters more than storage savings in modern cloud environments.

**Q: What is a degenerate dimension?**
A: A degenerate dimension is a dimension key stored in the fact table with no corresponding dimension table. It occurs when the dimension attribute has no other descriptive attributes — for example, a transaction ID or order number. These are stored directly in the fact table as a single column rather than creating a dimension table with only one column. Common in transactional fact tables.

---

## Data Lake

**Definition:** Centralized repository for storing raw data in native format (structured, semi-structured, unstructured) at any scale.

### Theory & Explanation

A data lake stores data **as-is**, with no schema required at write time — the schema is applied at read time (schema-on-read). This is the fundamental difference from a data warehouse, which requires schema-on-write. Data lakes are built on inexpensive object storage (Amazon S3, Azure Data Lake Storage, Google Cloud Storage) and can hold any data type: structured tables (CSV, Parquet), semi-structured data (JSON, XML, Avro), unstructured data (images, video, audio, PDFs, binary files). Storage costs are an order of magnitude cheaper than data warehouses.

The key advantages are **massive scale** (exabytes), **low cost**, and **schema flexibility** — new data sources can be ingested without schema design, and raw data is preserved for future use cases not anticipated at ingestion time. However, data lakes without governance quickly degenerate into **data swamps** — unorganized, undocumented repositories where data is impossible to find or trust. Challenges include poor data quality, lack of ACID transactions (partial writes during failures leave inconsistent state), performance limitations for interactive queries, and difficulty enforcing access controls at the record level.

**Delta Lake, Apache Iceberg, and Apache Hudi** are table formats that address these limitations by adding ACID transactions, time travel (versioning), schema enforcement, and efficient upserts to data lakes — creating a **data lakehouse** architecture. The lakehouse combines the flexibility and low cost of data lakes with the reliability and performance of data warehouses.

### Example

A company ingests mobile app clickstream data as raw JSON logs into an S3 data lake — each event file is timestamped and partitioned by date. A Spark job reads the raw JSON, performs schema inference, deduplication, and sessionization, then writes structured Parquet files back to the lake's cleaned zone. From there, structured data can be loaded into Redshift for BI dashboarding, or queried directly with Amazon Athena for ad-hoc analysis. Separately, product images uploaded by users are stored in the same data lake — a data scientist spawns a GPU cluster to run feature extraction via a CNN, saving the embedding vectors back to the lake for a visual search model.

### Interview Questions

**Q: How do you prevent a data lake from becoming a data swamp?**
A: Prevention requires implementing the same governance practices as a data warehouse: (1) define a clear zone structure (raw → staged → curated/analytics); (2) enforce metadata registration — every dataset must have a catalog entry with owner, description, schema, freshness; (3) implement access controls and data classification; (4) run automated quality checks (schema validation, completeness, freshness); (5) use table formats (Delta Lake, Iceberg) for ACID and versioning; (6) document data lineage via tools like DataHub or Marquez.

**Q: When to use data lake vs data warehouse?**
A: Use a data lake when: (1) storing raw/unstructured data; (2) the use case is not fully defined (flexibility needed); (3) ML/AI training requires large-scale raw data access; (4) storage costs must be minimized. Use a data warehouse when: (1) BI dashboards and reporting need fast, consistent query performance; (2) business users need direct SQL access; (3) data requires strict schema enforcement; (4) regulatory compliance requires data governance features (audit trails, access control). Increasingly, organizations use a **lakehouse** to get the best of both.

---

## Data Pipeline

**Definition:** Automated series of steps that ingest, process, transform, and deliver data from source to destination.

### Theory & Explanation

A data pipeline follows a lifecycle: **source** → **ingestion** → **processing** → **destination**. The source can be any data producer (transactional database, API, streaming events, file upload). Ingestion is either **batch** (scheduled, processes data in chunks — hourly/daily extracts) or **streaming** (continuous, millisecond latency). Processing includes cleansing, validation, deduplication, type casting, enrichment, aggregation, and business logic transformation. The destination is typically a data warehouse, data lake, analytics engine, or reverse ETL target (CRM, marketing platform).

**Batch pipelines** are simpler to build and debug: they process finite data on a schedule, load full or incremental snapshots, and retry on failure. **Streaming pipelines** handle unbounded data with stateful processing (windowing, watermarking) and require exactly-once or at-least-once semantics. The choice depends on latency requirements: batch for daily/hourly reporting; streaming for real-time dashboards, fraud detection, or operational alerts.

**Orchestration** is the backbone of data pipelines. Apache Airflow is the industry standard — pipelines are defined as Directed Acyclic Graphs (DAGs) of tasks with dependencies, retry logic, alerting, and execution history. Alternatives include Prefect (Python-native, easier to use) and Dagster (data-aware, with built-in asset management). Pipeline monitoring tracks data freshness (is today's data loaded?), volume anomalies (sudden drop/increase in row count), schema changes, task failures, and SLA compliance.

### Example

An Airflow DAG runs daily: (1) Extract orders from PostgreSQL since last run (incremental load); (2) Validate schema against expected structure (fail if column missing or type mismatch); (3) Transform — clean NULL values, calculate derived columns (total = quantity × price), aggregate customer-level daily metrics; (4) Load to Redshift `fact_daily_orders`; (5) Trigger downstream dbt run to refresh the reporting mart; (6) Send Slack notification with row count and job duration. Each step has retry logic (3 retries, exponential backoff), and if the entire DAG fails, an on-call engineer receives a PagerDuty alert within 5 minutes.

### Interview Questions

**Q: Batch vs streaming — how to choose?**
A: Batch is appropriate when: latency requirements are minutes/hours/days; data volume per batch is manageable; sources don't support streaming; the cost of streaming infrastructure isn't justified. Streaming is necessary when: sub-second latency is required (fraud detection, real-time personalization); data is a continuous unbounded stream; the use case requires stateful processing over event sequences. Many organizations start with batch and add streaming incrementally for specific high-value use cases.

**Q: How do you handle pipeline failures?**
A: A robust failure handling strategy includes: (1) automatic retries with exponential backoff for transient failures (network timeouts, resource contention); (2) idempotent pipeline design (running the same pipeline twice produces the same result); (3) incremental loading with watermark tracking to avoid full rebuilds on failure; (4) dead letter queues for records that repeatedly fail; (5) comprehensive alerting — failures first page on-call within minutes, then escalate; (6) post-mortem analysis — every production failure triggers root cause investigation and prevention measures.

---

## Data Governance

**Definition:** Overall management framework for data availability, usability, integrity, and security.

### Theory & Explanation

Data governance encompasses multiple **pillars**: **Data quality** ensures accuracy, completeness, timeliness, consistency, validity, and uniqueness. **Data stewardship** assigns ownership and accountability for data assets — every dataset has a designated steward responsible for its quality, documentation, and access approvals. **Data security** implements access controls (RBAC, column-level security), encryption at rest and in transit, dynamic data masking, and audit logging. **Data privacy** ensures compliance with regulations (GDPR, CCPA, LGPD) through PII classification, consent management, data retention, and right-to-erasure mechanisms. **Data lifecycle management** defines retention periods, archival strategies, and permanent deletion schedules. **Data standards** establish naming conventions, metadata standards, and documentation requirements across the organization.

A **governance council** typically includes business and IT representatives who meet regularly to review data assets, approve policies, and resolve disputes. Successful governance requires executive sponsorship — without top-down support, governance becomes an impediment that teams circumvent.

**Data contracts** are formal agreements between data producers and consumers specifying schema, freshness SLAs, quality guarantees, and breaking change notification periods. They shift governance left — producers commit to not breaking downstream consumers without notice. Tools: Collibra, Alation, Atlan, Databricks Unity Catalog.

### Example

A company implements customer data governance: PII columns (name, email, phone) are encrypted at rest with AES-256 and access is logged for auditing. Quarterly reviews check that only authorized teams access customer data. Data retention follows GDPR — customer data is retained for 7 years after account closure, then permanently deleted. The data steward for customer data is the VP of Marketing. Quality SLOs require < 1% null values on email and < 0.1% duplicate customer records. A data contract between the billing team (producer) and the analytics team (consumer) specifies that the `customer_accounts` table will refresh within 2 hours of event time and breaking schema changes require 30 days notice.

### Interview Questions

**Q: How would you implement data governance in a company with no existing practices?**
A: Start small and iterate: (1) Identify the 5-10 most critical data assets (revenue data, customer data, regulatory reports); (2) Assign a data steward for each critical asset; (3) Document metadata — schema, owner, description, freshness, quality checks; (4) Implement basic access controls on those critical assets; (5) Establish a data quality monitoring framework (Great Expectations); (6) Create a lightweight governance council with monthly meetings; (7) Define and publish data standards as the team grows. Avoid trying to govern everything at once — it will be overwhelming and resisted.

**Q: GDPR right to be forgotten — how do you implement it in a data warehouse?**
A: Implementation requires: (1) Identifying all tables containing PII across the warehouse, catalog, data lake, and backups; (2) Implementing a cascading deletion or anonymization process — when a deletion request is received, SQL scripts update/delete PII columns across all tables; (3) Handling Type 2 SCDs — for historical dimension rows, PII must be masked or replaced with a token; (4) Handling backups — you must either restore and scrub or rotate backup encryption keys so old backups are unrecoverable; (5) Handling data lake files — rewrite Parquet/JSON files in the affected partitions; (6) Proving compliance — each deletion must be logged with timestamp and affected records.

---

## Data Catalog

**Definition:** Organized inventory of data assets with metadata, lineage, and documentation to make data discoverable and understandable.

### Theory & Explanation

A data catalog stores three layers of metadata. **Technical metadata** describes the physical data asset: schema (column names, data types, partitions, file format), row count, storage location, access patterns, and freshness. **Business metadata** provides meaning: business definitions, KPI calculations, governed metric definitions, certification status, and usage context. **Operational metadata** captures environment information: data owner, steward, creation date, update frequency, source system, pipeline dependencies, and quality scores.

The catalog enables **data discovery** — analysts and data scientists search and browse assets by domain, tag, or keyword. Catalogs support social features: ratings, reviews, comments, and popularity signals that help users find the most trusted datasets. **Active metadata** extends this with machine learning — the catalog auto-suggests relationships, flags deprecated tables, recommends popular datasets, and alerts about breaking changes or quality degradation.

Catalog integration spans the entire data stack: data warehouses, data lakes, BI tools (Looker, Tableau), transformation tools (dbt), and orchestration tools (Airflow). **Open source** options include DataHub (LinkedIn) and Amundsen (Lyft). **Commercial** leaders include Atlan, Alation, and Collibra.

### Example

An analyst searches "customer revenue" in the data catalog. The search returns `fact_customer_revenue_monthly` as the top result — it is certified (green badge), well-documented, and highly rated. The catalog entry shows: description ("Revenue by customer per month from the billing system, refreshed daily"), owner ("Sarah J. — Finance"), data source lineage (billing system → Airflow ingestion → Snowflake staging → dbt transforms → Redshift curated), quality score (95%), schemas (columns: customer_id, revenue_month, total_revenue, order_count), and usage analytics (queried 47 times this week, used in 3 Looker dashboards).

### Interview Questions

**Q: How does a data catalog differ from a data dictionary?**
A: A data dictionary is a static document (often a spreadsheet or wiki page) listing tables, columns, and their definitions — typically created once and becomes stale. A data catalog is a dynamic, searchable platform that automatically syncs with the data warehouse, tracks lineage, captures usage, enables collaboration, and constantly updates as schemas change. A catalog subsumes the dictionary and adds discovery, governance, and operational features.

**Q: What information should a data catalog entry contain?**
A: A complete entry should include: (1) Basic identification (name, location, data source type); (2) Technical metadata (schema with column types, row count, partitions, update frequency); (3) Business metadata (description, business owner, definitions of key terms); (4) Quality metadata (completeness %, accuracy checks, certification status); (5) Lineage (upstream sources, downstream transformations and dashboards); (6) Usage (popularity, recent queries, consuming teams); (7) Governance (access requirements, sensitivity classification, retention policy); (8) Collaboration (steward contact, comments, documentation links).

---

## Data Lineage

**Definition:** Tracking the flow of data from its origin through transformations to its final destination — showing where data comes from, how it changes, and what depends on it.

### Theory & Explanation

Data lineage provides end-to-end visibility of data movement: **source system** → **ingestion** → **staging** → **transformation** → **analytics layer** → **dashboard/report**. This enables three critical capabilities. **Impact analysis**: before changing a source table schema, an engineer can see all downstream dependencies — which transformations will break, which dashboards will fail, which models need retraining. **Root cause analysis**: when a dashboard number looks wrong, lineage traces back through every transformation to identify where the error was introduced. **Auditing and compliance**: regulators require proof of data provenance — lineage provides the documented path from raw data to regulated reports.

**Column-level lineage** is the most granular and valuable form — it tracks individual fields through JOINs, aggregations, CASE statements, and derived calculations. For example, knowing that `customer_lifetime_value` in a dashboard originates from `SUM(order_amount * 0.95)` in a dbt model, which reads `order_amount` from the `stg_orders` table, which extracts it from the raw orders API.

**Backward lineage** answers "where did this come from?" — tracing upstream. **Forward lineage** answers "what depends on this?" — tracing downstream. **Automated lineage** is generated by parsing transformation code (SQL, Python). dbt automatically generates lineage by parsing `ref()` and `source()` calls in SQL models. For complex Python transforms, manual annotation or deep SQL parsing may be needed.

### Example

The CFO asks: "Why is Q3 revenue showing $2M less than expected?" The lineage tool traces from the revenue dashboard back: dashboard reads from `fct_revenue` → which is built in dbt by joining `stg_orders` with `dim_products` → `stg_orders` reads from `raw_orders` with a filter `WHERE order_id IS NOT NULL`. Investigation reveals the filter removed 10% of orders where `order_id` was NULL — but those were valid marketplace orders where the ID was stored in a different column. The fix: update the `stg_orders` transform to handle the alternative ID column. Without lineage, finding this root cause would require manual tracing through a dozen potential failure points.

### Interview Questions

**Q: Why is column-level lineage important?**
A: Table-level lineage tells you that a dashboard depends on a table. Column-level lineage tells you exactly which columns flow through which joins and transformations to produce a specific metric. This granularity is essential for: (1) precise impact analysis (a change to `customer_zip_code` won't affect `total_revenue`, but a change to `order_amount` will); (2) debugging (trace a specific number through the pipeline); (3) regulatory compliance (prove that a reporting metric uses the exact approved data sources and calculations).

**Q: How does dbt generate lineage automatically?**
A: dbt parses `ref()` and `source()` macros in SQL model files to build a dependency graph. Each model file declares its upstream dependencies: `{{ ref('stg_orders') }}` creates an edge from `stg_orders` to the current model. dbt also parses column selections and JOIN conditions to infer column-level lineage, though precise column tracing requires the query compiler (for full SQL parsing). The lineage graph is exposed in the dbt docs website and can be exported to external catalog tools via the manifest.json artifact.

---

## Data Quality

**Definition:** Measure of data fitness for its intended use, assessed across dimensions including accuracy, completeness, consistency, timeliness, validity, and uniqueness.

### Theory & Explanation

Data quality is measured across **six dimensions**. **Accuracy**: data reflects the real-world object or event it represents. **Completeness**: all expected data is present (no missing required fields). **Consistency**: data is coherent across systems (same customer name in CRM and billing). **Timeliness**: data is current enough for its intended use (real-time fraud detection needs sub-second freshness; monthly reporting can tolerate daily updates). **Validity**: data conforms to defined formats, schemas, and business rules (revenue must be ≥ 0, email must contain @). **Uniqueness**: no unintended duplicate records exist.

**Measurement** requires specific metrics per dimension: completeness = percentage of non-null values for required fields; uniqueness = distinct count / total count for ID fields; timeliness = 90th percentile of ingestion latency; accuracy = sampled records verified against source of truth. **Data quality SLAs** define acceptable thresholds: "Orders must have < 0.1% duplicate records, be loaded within 2 hours of event time, and have 99.9% completeness on required fields."

**Great Expectations** is the leading open-source data quality framework. You define **expectations** as Python code — `expect_column_values_to_not_be_null('email')`, `expect_column_values_to_be_between('age', 0, 120)`. Expectations are run as pipeline tests and produce data documentation with pass/fail results per run. Quality data is itself stored for trend analysis (is quality improving or degrading?).

### Example

A customer data quality audit reveals: completeness is 100% for email (required) but only 60% for phone (optional, unpopulated in 40% of profiles). Validity shows 2% of zip codes don't match the city/state mapping (likely data entry errors or outdated ZIP-to-city mappings). Uniqueness shows 0.5% duplicate customer records (same email address associated with different customer IDs, likely from different signup flows merging incorrectly). Each issue is documented in the data quality dashboard with severity ranking, steward assignment, and a remediation timeline.

### Interview Questions

**Q: How would you implement data quality monitoring at scale?**
A: A scalable implementation has three layers. Layer 1 — **pipeline-level checks**: each pipeline step validates data before passing to the next stage (row count ranges, null thresholds, schema validation). Layer 2 — **scheduled monitoring**: Great Expectations runs hourly against critical tables, checking all six dimensions; failures create tickets in the data quality tracker. Layer 3 — **proactive anomaly detection**: ML-based monitoring (whylogs, Evidently AI) tracks distributions over time and alerts on drift before it causes visible problems. Every check has an owner, severity, and automated escalation path.

**Q: What's the difference between data quality validation and data governance?**
A: Data quality validation is a specific set of technical practices (running checks, measuring dimensions, alerting on failures) within the broader data governance framework. Governance is the overall management structure — it defines who is responsible for quality (stewards), what the quality standards are (policies), and how quality issues are resolved (processes). Quality validation provides the data; governance provides the decision-making and accountability structure to act on that data.

---

## Data Versioning

**Definition:** Tracking and managing changes to datasets over time, analogous to code version control, enabling reproducibility and rollback.

### Theory & Explanation

Data versioning addresses a critical need: **reproducibility**. A machine learning model trained on data from two months ago should be reproducible with exactly the same data. Without versioning, source data changes (schema evolution, corrections, late-arriving records) make this impossible. **Auditability** requires knowing exactly what data was used for a specific report or model — regulators and stakeholders need this proof. **Collaboration** is improved when teams share consistent data snapshots rather than each member extracting their own copy. **Rollback** capability means a bad transformation can be undone by restoring the previous version.

Three major approaches exist. **(1) DVC (Data Version Control)** — git-like versioning for data files stored in cloud storage (S3, GCS). DVC stores metadata (pointers + checksums) in git and the actual data in remote storage, enabling `git checkout` for code + `dvc checkout` for data together. **(2) Delta Lake time travel** — built-in versioning: `SELECT * FROM table VERSION AS OF 123` or `SELECT * FROM table TIMESTAMP AS OF '2024-03-15'`. Every write creates a new version; old versions are retained until vacuumed. **(3) lakeFS** — git-like branches for data lakes: create branches for experimental transformations, merge validated changes to main, and rollback with revert.

The key challenge is **storage cost**. Every dataset change can create a new full copy. DVC uses diff-based versioning (only changed files are stored). Delta Lake stores only changed Parquet files per version. lakeFS uses copy-on-write to minimize storage overhead. Without these approaches, naive snapshotting (full COPY per version) becomes prohibitively expensive.

### Example

An ML team trains a churn prediction model. They use DVC: `dvc run -n train -d data/processed_features.csv -m metrics.json python train.py`. Every run versions the input data and output metrics. Three months later, they discover the latest feature engineering pipeline produced worse results than the previous version. They run `git log` to find the earlier commit, then `git checkout <old-commit>` and `dvc checkout data/processed_features.csv`. The exact training data from three months ago is restored. They retrain the model and reproduce the earlier metrics exactly — proving the feature pipeline change caused the degradation.

### Interview Questions

**Q: How is data versioning different from data backups?**
A: Backups are full or incremental snapshots designed for disaster recovery — you restore the latest backup to recover from data loss. Versioning maintains a history of intentional changes over time for reproducibility, audit, and rollback. Backups are typically overwritten on a rotation schedule (daily backup kept for 30 days). Versioning keeps immutable snapshots keyed by timestamp or commit ID. A backup can be restored forward (latest state), but versioning allows you to travel backward or forward to any specific point in time.

**Q: What's the storage cost trade-off of data versioning?**
A: Full versioning (complete copy per version) costs N × storage for N versions — expensive for large datasets. Modern approaches reduce this: DVC stores only changed files (diff-based); Delta Lake stores only new Parquet files per version (unchanged files are shared via Parquet's immutable design); lakeFS uses copy-on-write (only changed objects are new, unchanged objects are pointers to existing data). The trade-off is storage savings vs. complexity. For most ML use cases, retaining 30-90 days of granular versions with monthly long-term snapshots provides good coverage at reasonable cost.

---

## Feature Store

**Definition:** Centralized repository for storing, managing, and serving machine learning features consistently across training and inference.

### Theory & Explanation

The fundamental problem a feature store solves is **training-serving skew**: features computed during model training (batch, historical, offline) differ from features computed during inference (real-time, online) because the computation is implemented differently in each code path. A feature store provides a **single source of truth** for feature definitions — the same `average_ride_distance_7d` function is used for both training and serving.

A feature store has two layers. The **offline store** stores large historical feature datasets for training — typically Parquet files in S3 or tables in BigQuery, supporting point-in-time queries for **time travel** joins (joining labels to features as they existed at prediction time, avoiding data leakage). The **online store** serves current feature values at low latency (< 10ms) for real-time inference — typically Redis, DynamoDB, or Cassandra. Feature computation can be **batch** (daily aggregations, windowed statistics) or **streaming** (real-time counts, rolling averages via Kafka/Flink).

Key capabilities: **(1) Point-in-time correctness** — when training, each label is joined to feature values as they were at prediction time, not as they are today (which would include future information and cause leakage). **(2) Feature sharing** — teams discover and reuse features built by other teams, reducing redundant computation. **(3) Consistent serving** — training features and serving features are computed with identical logic. **(4) Feature monitoring** — track feature distributions over time to detect drift.

### Example

A ride-sharing company defines `average_ride_distance_7d` as a feature: the average ride distance for a driver over the past 7 days. During **training**, the feature store accepts a DataFrame of (driver_id, prediction_timestamp) pairs and returns the historical average for each timestamp — `WHERE ride_timestamp < prediction_timestamp AND ride_timestamp >= prediction_timestamp - 7 DAYS`. This guarantees no future information leaks into training. During **inference**, when a ride request comes in, the feature store returns the current running average from Redis in under 10ms. The same feature definition serves both paths. Two teams (ETA prediction and dynamic pricing) both use this feature from the shared store with identical semantics.

### Interview Questions

**Q: What is training-serving skew and how does a feature store prevent it?**
A: Training-serving skew occurs when feature computation differs between training and inference. For example, training code computes `avg_transaction_amount` over a 30-day window using SQL in Spark, but inference code computes it using a Python rolling average over the last 30 API events. Differences in window definition, null handling, data availability, or aggregation logic cause the model to see different values than it was trained on, degrading accuracy. A feature store prevents this by defining feature transformations once and executing them consistently in both the offline store (for training) and online store (for serving) using identical logic.

**Q: Online store vs offline store — why both?**
A: The offline store is optimized for **throughput** — scanning billions of historical rows to create training datasets. It uses columnar storage (Parquet) and distributed query engines (Spark, BigQuery). Latency is seconds to minutes. The online store is optimized for **latency** — serving individual feature lookups at sub-10ms for real-time inference. It uses key-value storage (Redis, DynamoDB) and handles millions of requests per second. Both are needed because the same features must support two very different access patterns.

---

## A/B Testing

**Definition:** Controlled experiment comparing two variants (A = control, B = treatment) by randomly assigning users to groups and measuring the difference in a target metric.

### Theory & Explanation

A/B testing is the gold standard for causal inference in product and business decisions. Core principles: **Randomization** ensures each user has an equal chance of assignment, creating statistically equivalent groups so that any observed difference can be attributed to the treatment. **Sample size determination** uses power analysis: significance level α = 0.05 (5% chance of Type I error — false positive), power β = 0.80 (20% chance of Type II error — false negative), and the **Minimum Detectable Effect (MDE)** — the smallest effect size worth detecting. Sample size increases as MDE decreases: detecting a 0.1% lift requires much more data than a 5% lift.

The **peeking problem** occurs when experimenters check results repeatedly during data collection and stop early when results reach significance. This inflates the Type I error rate dramatically — checking daily can push false positive rates to 20-30% or higher. Solutions: (1) pre-register a fixed sample size and never peek; (2) use sequential testing methods (always valid p-values, group sequential designs) that allow monitoring without inflating error rates.

**Metrics** are categorized as: **Primary metric** — the target of optimization (conversion rate, revenue per user). **Secondary metrics** — guardrail metrics that should not degrade (page load time, customer support tickets). **Proxy metrics** — correlated with the true metric but measurable earlier/faster. **Statistical tests**: chi-square for proportion-based metrics (conversion rate), t-test for continuous metrics (revenue per user), Mann-Whitney for non-normal distributions. **Simpson's paradox** can mask or reverse effects — always disaggregate results across segments (device type, country, traffic source).

**Practical significance** matters more than statistical significance. A statistically significant result (p < 0.05) with a tiny effect size (0.01% lift on conversion) may not be worth implementing. Compute the expected business impact: +0.3 percentage points × 10M annual transactions × $50 average order = $1.5M. That is practically significant.

### Example

An e-commerce company tests a new checkout button color. 50,000 users are randomly assigned to control (blue button) and 50,000 to treatment (green button). Control conversion rate = 3.2% (1,600 purchases); treatment conversion rate = 3.5% (1,750 purchases). A chi-square test yields: χ² = 6.84, p = 0.009. Since p < 0.05, the result is statistically significant. The relative lift = (3.5% / 3.2% - 1) × 100% = +9.4%. Practical impact: +0.3 percentage points × 5M annual purchasers × $80 average order = $1.2M/year. Guardrail metrics (page load time, error rate) are unchanged. The green button is rolled out to all users.

### Interview Questions

**Q: How many users do you need for an A/B test?**
A: The required sample size depends on α (typically 0.05), β (typically 0.20), and MDE. Formula: n = (Z_α/2 + Z_β)² × (p₁(1-p₁) + p₂(1-p₂)) / (p₂ - p₁)² for proportions. For a conversion rate improving from 3.2% to 3.5% (MDE = 0.3pp), n ≈ 50,000 per group. For detecting a 0.1pp lift from 3.2%, n ≈ 450,000 per group. A power analysis calculator should be used before every experiment to ensure the test is adequately powered.

**Q: What's the peeking problem and how do you avoid it?**
A: Peeking means checking results early and potentially stopping based on data-dependent significance. Each peek inflates the Type I error rate — after 50 peeks, a truly null result has ~40% chance of being declared significant. Avoid it by: (1) pre-registering sample size and not looking at results until the data collection is complete; (2) using sequential testing methods (Lan-DeMets spending function, always-valid p-values) that correct for multiple looks; (3) implementing automated stopping rules in the experimentation platform rather than manual checking.

**Q: How would you analyze results if the test was not properly randomized?**
A: If randomization is violated (e.g., treatment assigned by userID parity, geography, or self-selection), groups may differ on confounding variables. Use causal inference methods: (1) propensity score matching — estimate the probability of treatment assignment and match treated/control units on propensity scores; (2) difference-in-differences — compare the change in treatment group against the change in control group over time; (3) instrumental variables — if a randomized instrument exists; (4) CUPED (Controlled-experiment using Pre-Experiment Data) — use pre-experiment covariates to reduce bias. Document the violation transparently and caveat conclusions accordingly.

---

## Semi-supervised Learning

**Definition:** Combines small labeled data with large unlabeled data, leveraging the structure of the data distribution to improve performance when labels are scarce.

### Theory & Explanation

Semi-supervised learning (SSL) is based on three core assumptions. **Smoothness assumption**: if two points are close in the input space, their labels should be similar. **Cluster assumption**: data forms clusters, and points in the same cluster share the same label — decision boundaries should lie in low-density regions. **Manifold assumption**: high-dimensional data lies on a lower-dimensional manifold, and learning can be done on that manifold.

Self-training is the simplest approach: train a model on labeled data, use it to predict pseudo-labels on unlabeled data, select high-confidence predictions, add them to the training set, and retrain. The risk is **confirmation bias** — once the model starts making incorrect high-confidence predictions, errors reinforce themselves. **Co-training** splits features into two independent views, trains separate models on each, and uses the highest-confidence predictions from one view to augment the other.

**Consistency regularization** (FixMatch, MixMatch) is the current state of the art. It applies weak augmentation (standard flip-and-crop) to unlabeled data to generate pseudo-labels, then applies strong augmentation (RandAugment, CTA) to the same data and trains the model to predict the same label under heavy augmentation — enforcing augmentation invariance. FixMatch combines this with a confidence threshold: only pseudo-labels with probability above a threshold (e.g., 0.95) are used, dramatically reducing confirmation bias.

### Example

A medical imaging dataset has 500 labeled X-ray images and 50,000 unlabeled images. A FixMatch model is trained: labeled images train with standard cross-entropy; unlabeled images are weakly augmented to generate pseudo-labels with confidence threshold 0.95, then strongly augmented to train the consistency loss. The model achieves 93% accuracy on the test set — compared to 82% with only the 500 labeled samples (standard supervised learning). The key is the SSL assumption that bone structure variations in X-rays lie on a low-dimensional manifold that unlabeled data helps map.

### Interview Questions

**Q: What assumptions must hold for SSL to work?**
A: SSL works when the data distribution has structure that unlabeled data can help reveal. The cluster assumption must hold — decision boundaries should fall in low-density regions. The smoothness assumption must hold — nearby points should have similar labels. The manifold assumption must hold — the data must lie on a lower-dimensional manifold. If these assumptions are violated (e.g., classes are highly overlapping, or the data is pure noise), SSL can actually degrade performance.

**Q: Confirmation bias in SSL — how to address?**
A: Confirmation bias arises when the model's own predictions reinforce errors — incorrect high-confidence pseudo-labels from early training persist and contaminate the model. Mitigation strategies: (1) use a confidence threshold (only pseudo-labels above 0.95 are used); (2) use strong augmentation on unlabeled data so predictions are tested against transformation invariance; (3) employ a diverse ensemble of models for pseudo-label generation; (4) anneal the weight of the unsupervised loss, starting low and increasing as the model improves; (5) use MixMatch-like approaches that sharpen predictions without hard thresholding.

---

## Reinforcement Learning

**Definition:** An agent learns sequential decisions through trial-and-error interaction with an environment, maximizing cumulative reward signals.

### Theory & Explanation

Reinforcement Learning (RL) is formalized as a **Markov Decision Process (MDP)**: a tuple (S, A, P, R, γ) where S is the set of states, A is the set of actions, P(s' | s, a) is the transition probability, R(s, a) is the immediate reward, and γ (discount factor) determines how much future rewards are valued. The agent learns a **policy** π(a | s) — a mapping from states to actions — that maximizes expected cumulative discounted reward.

The **exploration vs exploitation** dilemma is central: the agent must try new actions (explore) to discover better strategies while also exploiting known good actions for reward. Common strategies: ε-greedy (take random action with probability ε, decaying over time), Upper Confidence Bound (UCB — choose actions with high uncertainty), and Thompson sampling (sample from posterior distribution of action values).

Algorithm families: **Value-based** methods estimate the optimal value function Q*(s, a) — the expected return from taking action a in state s. Q-learning learns Q(s, a) via the Bellman update: Q(s, a) ← Q(s, a) + α[R + γ max_a' Q(s', a') - Q(s, a)]. DQN extends this with deep neural networks and experience replay. **Policy-based** methods (REINFORCE, PPO) directly optimize the policy π(a | s) using gradient ascent on expected reward. **Actor-Critic** methods (A3C, SAC) combine both — the actor learns the policy, the critic learns the value function. Applications include game-playing (AlphaGo, Dota 2), robotics, autonomous driving, and RLHF (reinforcement learning from human feedback) for fine-tuning LLMs.

### Example

An agent learns to navigate a 5×5 grid world. The goal position (+10 reward) is in the top-right corner; pits (−5 reward) are in two other cells. Q-learning initializes Q(s, a) = 0 for all state-action pairs. The agent explores with ε = 1.0, decaying to 0.1 over 1,000 episodes. Initially, it takes random actions, occasionally reaching the goal and updating Q-values. Over time, the optimal path emerges: the Q-values propagate backward from the goal via the Bellman equation. After convergence, the agent follows the optimal path every episode, avoiding pits. The learned policy generalizes — even if starting position changes, the agent navigates optimally from the new state.

### Interview Questions

**Q: On-policy vs off-policy — what's the difference?**
A: On-policy methods evaluate or improve the same policy that generates behavior. The agent must learn from experience generated by the current policy — changing the policy invalidates previous experience. SARSA is on-policy. Off-policy methods can learn from experience generated by any behavior policy. Q-learning is off-policy: it learns the optimal Q-function regardless of how actions were chosen. This makes Q-learning more sample-efficient (it can reuse past experience) and compatible with experience replay. The trade-off: off-policy methods have higher variance and can be less stable.

**Q: Credit assignment problem in RL?**
A: The credit assignment problem is determining which actions in a sequence were responsible for a delayed reward. A robot might take 100 actions before reaching a goal — which actions were critical? The naive approach (reward each action equally) is incorrect. Temporal difference learning addresses this by bootstrapping: current Q-value is updated toward the current reward plus the estimated value of the next state, propagating credit one step at a time. Eligibility traces (λ-returns) extend this by mixing multi-step returns, providing a smooth trade-off between bias and variance in credit assignment.

**Q: When to use PPO vs DQN?**
A: PPO (Proximal Policy Optimization) is preferred when: (1) the action space is continuous (robotics, autonomous driving); (2) the action space is high-dimensional; (3) you need stable, monotonic improvement; (4) the environment is partially observable. DQN is preferred when: (1) the action space is discrete and small; (2) experience replay is beneficial; (3) the environment is deterministic or near-deterministic. For most modern RL problems, PPO or SAC (Soft Actor-Critic) are the default choices unless the action space is small and discrete.

---

## Bias (Data)

**Definition:** Systematic errors in data collection, sampling, or labeling that cause the data to misrepresent the true distribution of the phenomenon being studied.

### Theory & Explanation

Data bias takes many forms. **Sampling bias** occurs when the sampling process does not reflect the population — surveying only smartphone users about internet access misses the offline population. **Measurement bias** occurs when data collection instruments systematically error — a poorly calibrated sensor reads temperature 2°C low, or a survey question is leading. **Reporting bias** occurs when certain observations are more likely to be recorded — people with severe side effects are more likely to report them than those with mild symptoms. **Survivorship bias** occurs when only surviving or successful cases are observed — analyzing successful startups without considering the thousands that failed. **Confirmation bias** occurs when data collection favors pre-existing beliefs — labeling errors that align with annotator expectations.

Bias propagates from data through models. A model trained on biased data learns and amplifies the bias. **Detection** requires: statistical audits comparing dataset distributions to known population distributions; **disaggregated evaluation** — measuring model performance separately across demographic groups, income levels, geographic regions; and **fairness metrics** — demographic parity (equal prediction rates across groups), equal opportunity (equal true positive rates), equalized odds (equal TPR and FPR).

**Mitigation** happens at three stages. **Pre-processing**: reweight training samples to match population proportions; resample to balance groups; transform features to remove protected attributes. **In-processing**: add fairness constraints to the loss function; use adversarial debiasing (train to maximize accuracy while minimizing an adversary's ability to predict the protected attribute). **Post-processing**: adjust decision thresholds independently per group to achieve parity; calibrate predictions after model output.

### Example

A hospital trains a readmission prediction model on five years of data (2018-2022). Due to COVID, 2020 admissions were disproportionately elderly patients. The model learns that "age > 65" is a strong predictor, but the 2020 oversampling of elderly patients (who have different readmission patterns) biases this relationship. In production on 2024 data, the model over-predicts readmission risk for all elderly patients. Detection: the Population Stability Index (PSI) comparing training age distribution to deployment distribution flags significant drift. Mitigation: reweight 2020 samples to match the expected population age distribution, reducing their influence.

### Interview Questions

**Q: How to detect bias in production ML?**
A: Implement continuous monitoring at three levels: (1) **Input monitoring** — track feature distribution shifts (PSI, KS statistic) between training and production; flag demographic representation shifts. (2) **Model monitoring** — track prediction distribution changes (is the model predicting positive outcomes at different rates across groups?). (3) **Outcome monitoring** — the most important but hardest — track actual outcomes when available. Compare false positive rates and false negative rates across demographic segments using disaggregated dashboards. When disparities exceed thresholds, trigger investigation and model retraining.

**Q: Survivorship bias — give an ML example.**
A: A model trained to predict startup success uses a dataset of successfully funded startups from CrunchBase. It learns that "raised Series A" is a strong feature. This is survivorship bias — the dataset only contains startups that survived long enough to raise funding. The model cannot learn the patterns of failure (which are crucial to predicting success). In practice, the model would recommend investing in startups that look like past successes but miss warning signs that only appear in failed startups' data. Countermeasure: deliberately include failed startups (from acquisition databases, bankruptcy filings) and label them as negative cases.

**Q: Label bias vs measurement bias?**
A: Label bias (annotation bias) occurs when the ground-truth labels themselves are systematically wrong — annotators favor certain outcomes, or the labeling guidelines encode subjective judgments. For example, labeling toxicity in comments where annotators disagree about sarcasm. Measurement bias occurs when the input features are systematically distorted — survey responses where socially undesirable answers are under-reported. Label bias corrupts the target variable; measurement bias corrupts the features. Both harm model quality but require different fixes: label bias needs better annotation guidelines; measurement bias needs better sensors or survey design.

---

## Imbalanced Data

**Definition:** Classification datasets with heavily skewed class distributions where the minority class is typically the class of interest.

### Theory & Explanation

Standard machine learning models optimize for overall accuracy, which is misleading on imbalanced data. A fraud detector that predicts "not fraud" for every transaction achieves 99.8% accuracy — but fails entirely at its purpose. This is the **accuracy paradox**: high accuracy despite zero predictive value for the minority class.

**Resampling** balances classes. **Random undersampling** removes majority class samples randomly — simple but loses potentially useful data. **SMOTE (Synthetic Minority Oversampling Technique)** generates synthetic minority samples by interpolating between existing minority points: x_new = x_i + λ(x_j - x_i) where x_i and x_j are k-nearest neighbors from the minority class and λ ~ Uniform(0, 1). SMOTE creates plausible new examples rather than duplicating existing ones. **ADASYN** adaptively generates more synthetic samples in regions where the minority class is hardest to learn.

**Algorithmic approaches** include: **Class weighting** — assign higher misclassification cost to minority class errors, typically inversely proportional to class frequency (weight = N_majority / N_minority). **Cost-sensitive learning** — incorporate a cost matrix into the loss function. **Focal loss** — down-weights well-classified examples, forcing the model to focus on hard minority examples.

**Evaluation** must use metrics not distorted by imbalance: **Precision** (TP / (TP + FP)), **Recall** (TP / (TP + FN)), **F1-score** (harmonic mean of precision and recall), **PR-AUC** (precision-recall area under curve — much better than ROC-AUC for imbalance), and **MCC** (Matthews correlation coefficient — balanced measure even with severe skew).

### Example

Credit card fraud detection: the dataset has 492 fraudulent transactions out of 284,807 total (0.17%). A baseline model predicting "not fraud" for everything achieves 99.83% accuracy but 0% recall. After applying SMOTE: synthetic fraud samples are generated to create a 50/50 balanced training set. The model now achieves 92% recall (up from a naive model's 30%) at 85% precision. Alternatively, class weighting assigns weight 1000× to fraud samples in the loss function, achieving 88% recall with less synthetic data overhead. PR-AUC improves from 0.15 (baseline) to 0.72 (SMOTE) to 0.68 (class weighting).

### Interview Questions

**Q: Why is ROC-AUC misleading for imbalanced data?**
A: ROC-AUC plots TPR (true positive rate) against FPR (false positive rate). With high imbalance, FPR is dominated by the huge number of true negatives — even a large number of false positives barely moves FPR. The curve can look excellent while the model performs poorly on the minority class. For example, with 99.8% majority class, FPR = 0.01 means only 0.01 × 284,000 ≈ 2,840 false positives, but that may be unacceptable for fraud detection. **PR-AUC** is better because precision directly accounts for false positives relative to the minority class size: precision = TP / (TP + FP) — if the minority class is tiny, any FP significantly hurts precision.

**Q: SMOTE vs class weighting — when to use each?**
A: SMOTE is preferred when: (1) the minority class has very few samples (< 100) and the model cannot learn the decision boundary without more data; (2) the minority class is well-clustered so interpolation produces realistic samples; (3) the dataset is not excessively large (SMOTE increases dataset size). Class weighting is preferred when: (1) the minority class has enough samples to define a decision boundary (hundreds+); (2) the dataset is large enough that SMOTE would be computationally expensive; (3) you want to avoid any risk of generating unrealistic synthetic data; (4) you're using a probabilistic model that responds well to cost weighting (logistic regression, neural networks). In practice, many practitioners try both and select by validation performance.

**Q: Multi-class imbalance strategies?**
A: Extend binary approaches: (1) **One-vs-Rest** — treat each class as binary (minority vs rest), apply SMOTE or weighting per class. (2) **Hierarchical** — group rare classes into a superclass, classify fine-grained only when confident. (3) **Focal loss** extends naturally to multi-class with class-specific focusing parameters. (4) **Class-balanced loss** — weight each class by 1 / (1 - β^n_c) where n_c is class sample count and β is a smoothing parameter. (5) **Decoupled training** — first learn representations on imbalanced data, then fine-tune the classifier layer with balanced sampling.

---

## EDA (Exploratory Data Analysis)

**Definition:** An investigative approach to understanding data distributions, patterns, anomalies, and relationships before formal modeling or hypothesis testing.

### Theory & Explanation

EDA follows a structured progression from simple to complex. **Univariate analysis** examines each variable in isolation: histograms for distributions, box plots for outliers and quartiles, summary statistics (mean, median, standard deviation, skewness, kurtosis), and Q-Q plots for normality assessment. **Bivariate analysis** explores relationships between pairs of variables: scatter plots for continuous-continuous relationships, grouped box plots for continuous-categorical, stacked bar charts for categorical-categorical, and correlation matrices (Pearson for linear, Spearman for monotonic). **Multivariate analysis** explores interactions among multiple variables: pair plots (scatter matrix), PCA/t-SNE/UMAP for dimensionality reduction and cluster visualization, parallel coordinates, and heatmaps of interaction effects.

The purpose is exploration, not confirmation. EDA uncovers patterns that generate hypotheses — it does not test them. Specific goals include understanding **distributions** (are they normal, skewed, bimodal, multimodal?), detecting **anomalies** (extreme values, impossible combinations, missing data patterns), testing **assumptions** (linearity, homoscedasticity, normality for downstream tests), and generating **hypotheses** for formal testing.

EDA typically consumes 60-80% of project time. Tools: pandas-profiling (now ydata-profiling) for automated univariate reports; matplotlib and seaborn for static visualizations; plotly for interactive exploration; missingno for visualizing missing data patterns. The best EDA combines automated profiling with targeted manual investigation guided by domain knowledge.

### Example

EDA on a loan application dataset reveals: (1) credit score is bimodal with peaks at 620 and 750 — indicating two distinct populations; (2) 50 records show income < $20,000 with loan amounts > $100,000 — identified as suspicious entries for further investigation; (3) employment length has a **missing not at random (MNAR)** pattern — missing values are concentrated in the low credit score segment (likely unemployed or self-employed applicants who skip the field); (4) young applicants (< 25) with high loan amounts (> 3× income) have a 40% default rate compared to 5% overall — a strong risk segment identified during multivariate analysis.

### Interview Questions

**Q: Walk through your EDA process on a new dataset.**
A: (1) Load and inspect: check shape, data types, first/last rows, summary statistics. (2) Missing data analysis: percentage of missing values per column, visualize missing patterns (missingno), determine MCAR/MAR/MNAR. (3) Univariate: histograms + box plots for numeric columns, value counts + bar charts for categorical columns, identify outliers and distribution shapes. (4) Bivariate: correlation heatmap (limit to numeric), cross-tabulations for categorical pairs, scatter plots for promising numerics. (5) Targeted: follow up on interesting patterns — why is this feature bimodal? Why are these records outliers? (6) Summary: document findings, generate hypotheses, note data quality issues, produce visualization dashboard for stakeholder review.

**Q: High-dimensional EDA (1000+ features) — how do you approach it?**
A: Individual feature plots are impractical at 1000+ dimensions. Strategy: (1) Start with automated profiling (pandas-profiling) to flag distributions, missing rates, and outliers. (2) Use PCA / t-SNE / UMAP to visualize global structure — do natural clusters emerge? (3) Filter by variance — remove near-zero variance features. (4) Correlation clustering — group highly correlated features, select representative from each cluster. (5) Target-based filtering — compute univariate association with target (mutual information, AUC) for each feature; examine top 30-50 features individually. (6) Regularized models (Lasso, Ridge) for feature selection — which features survive regularization? (7) SHAP or permutation importance on an initial model to understand feature contributions.

**Q: EDA vs hypothesis testing — when does exploration end?**
A: EDA is for discovery and hypothesis generation; hypothesis testing is for confirmation. The transition happens once you have a specific, testable claim — "customers under 25 with high loan amounts have higher default rates" becomes a hypothesis to be tested on a holdout set or with a formal statistical test (chi-square or logistic regression). The danger of mixing them is **data dredging** (p-hacking) — if you explore until you find a pattern and then declare it statistically significant without adjusting for multiple comparisons, your conclusions are unreliable. Best practice: set aside a holdout dataset before EDA begins, and only use it for confirmatory testing of hypotheses discovered during exploration.

---

## Shapiro-Wilk Test

**Definition:** A statistical test for normality with the null hypothesis H₀ that the sample is drawn from a normal distribution. The W statistic measures how well ordered sample values match expected normal order statistics.

### Theory & Explanation

The Shapiro-Wilk test computes the W statistic: W = (Σ a_i x_(i))² / Σ (x_i - x̄)², where x_(i) are the ordered sample values and a_i are constants derived from the expected values of normal order statistics. The numerator captures how well the ordered sample correlates with the expected values under normality. W ranges from 0 to 1 — values close to 1 indicate normality; small values indicate departure from normality.

Shapiro-Wilk is considered the **most powerful** normality test for general alternatives — it has better statistical power (ability to detect non-normality) than Kolmogorov-Smirnov, Anderson-Darling, or the D'Agostino-Pearson test for most distributions. Implementation is straightforward: `scipy.stats.shapiro(x)` returns the W statistic and p-value. If p < α (typically 0.05), reject H₀ and conclude the data is not normal.

Sample size sensitivity is critical. For **n < 20**, the test has **low power** — it may fail to detect even strong non-normality. For **n > 5,000**, the test detects **trivial deviations** — even data from a nearly-normal distribution will reject H₀ because real-world data is never perfectly normal. The recommended range is n = 20 to n = 2,000. For larger samples, rely on Q-Q plots and skewness/kurtosis values rather than the p-value alone.

### Example

A researcher measures 30 reaction times (in milliseconds): [245, 312, 298, 421, 287, 305, ...]. Shapiro-Wilk returns W = 0.924, p = 0.037. Since p < 0.05, the null hypothesis of normality is rejected. The researcher examines a histogram — the distribution is right-skewed with several slow responses. After log transformation, Shapiro-Wilk on log(rt): W = 0.971, p = 0.58. The transformed data is consistent with normality. Decision: use the Mann-Whitney U test (non-parametric) for group comparisons on original data, or use log-transformed data with a t-test.

### Interview Questions

**Q: Why does Shapiro-Wilk fail on large samples?**
A: Real-world data is never perfectly normal — there will always be minor deviations (slight skew, minor kurtosis, rounding). With large n, the test has sufficient power to detect these trivial deviations as statistically significant. A sample of 10,000 with skewness 0.1 and kurtosis 3.1 (very nearly normal) will likely produce p < 0.001, rejecting normality. The correct interpretation is not "the data is severely non-normal" but "the sample is large enough to detect a negligible departure." For large samples, assess normality visually (Q-Q plot) and by effect size (skewness < |1|, kurtosis < |3|) rather than by p-value.

**Q: Shapiro-Wilk vs Kolmogorov-Smirnov — which should you use?**
A: Shapiro-Wilk is generally preferred for normality testing because it is more powerful — it detects non-normality with smaller sample sizes. The Kolmogorov-Smirnov test (Lilliefors-corrected for estimated parameters) compares the empirical distribution function to the normal CDF but has weaker power, especially for detecting tail deviations. Standard practice: use Shapiro-Wilk for n = 20-2,000; use Q-Q plots + skewness/kurtosis for larger samples; avoid KS for normality testing unless you specifically need a distribution-free test.

**Q: Does p > 0.05 prove normality?**
A: No. p > 0.05 means the test did not detect a significant departure from normality — it does not prove the data is normal. The failure to reject H₀ could be due to genuinely normal data, but equally could be due to insufficient power (small sample size) or the test being insensitive to the specific type of non-normality present. Always assess normality using multiple methods: Shapiro-Wilk, Q-Q plots, skewness (< |1|), kurtosis (< |3|), and histograms. Consistency across methods provides confidence.

---

## Levene's Test

**Definition:** A statistical test for homogeneity of variances across groups, with the null hypothesis H₀ that group variances are equal. Used as a prerequisite for ANOVA and two-sample t-tests.

### Theory & Explanation

Levene's test assesses whether k groups have equal variances — a key assumption of standard ANOVA and the two-sample t-test (which assume homoscedasticity). The test computes absolute deviations of each observation from its group's central tendency, then performs an ANOVA on those deviations. If the group mean absolute deviations differ significantly, the null hypothesis of equal variances is rejected.

The test has three variants depending on the central tendency used. **Mean-based** (using group means): most powerful under normality but sensitive to non-normality. **Median-based** (default in most implementations): more robust to non-normality and is the recommended default. **Trimmed mean-based** (10% trimmed mean): a compromise — retains some power under normality while improving robustness. The median version is also known as the **Brown-Forsythe test**. Implementation: `scipy.stats.levene(*groups, center='median')`.

Levene's test is **less sensitive to non-normality** than alternatives: **Bartlett's test** is the most powerful when data is perfectly normal but extremely sensitive to non-normality (a small departure inflates Type I error). The **F-test of variances** (ratio of two variances) is similarly non-robust and should only be used for normal data. Levene's is the safe default for most applications.

### Example

A researcher compares three teaching methods. Group A variance = 45, Group B variance = 120, Group C variance = 50. Levene's test with median center: W = 4.28, p = 0.018. Since p < 0.05, the null hypothesis of equal variances is rejected. The standard ANOVA cannot be used because it assumes homoscedasticity. Instead, the researcher uses **Welch's ANOVA** (which does not assume equal variances) or transforms the outcome variable (log transform reduces variance differences: after log transform, Levene's W = 1.89, p = 0.16 — variances are now homogeneous).

### Interview Questions

**Q: Why not always use Welch's t-test instead of testing for equal variances?**
A: This is a reasonable position — many statisticians recommend always using Welch's t-test as the default, bypassing Levene's test entirely. Welch's t-test does not assume equal variances and performs nearly as well as the standard t-test when variances are equal. The argument for checking first: (1) in ANOVA with 3+ groups, Welch's ANOVA is not always supported in all software; (2) if variances are equal, the standard test has slightly more power; (3) knowing about variance heterogeneity is itself informative about the data (treatment may affect variance as well as mean). In practice, for two-group comparisons, default to Welch's; for multi-group ANOVA, check with Levene's.

**Q: Levene's vs Bartlett's test — which is better?**
A: Levene's is better for general use because it is robust to non-normality — it produces valid Type I error rates even when the data is not normal. Bartlett's test is more powerful than Levene's *when the data is exactly normal*, but extremely sensitive to non-normality (a small departure inflates false positives dramatically). Since real data is rarely perfectly normal, Levene's is the safer default. Use Bartlett's only when you know the data is normally distributed (checked via Shapiro-Wilk or Q-Q plots).

**Q: If Levene's test is significant, can you still run ANOVA?**
A: You should not run standard ANOVA if Levene's test rejects equal variances, because heteroscedasticity inflates the Type I error rate (you are more likely to find a false significant result). Alternatives: (1) **Welch's ANOVA** — does not assume equal variances, available in most statistical software; (2) **Kruskal-Wallis test** — non-parametric alternative that does not assume normality or equal variances; (3) **transform the outcome** — log, square root, or Box-Cox transformation may stabilize variances; (4) **robust regression** — uses heteroscedasticity-consistent standard errors. Always report which approach was used and why.

---

## Data Science Workflow

**Definition:** A structured 10-stage process from business problem framing to deployed, monitored solution that guides data science projects from conception to production.

### Theory & Explanation

The data science workflow provides a systematic framework for tackling data problems. Each stage has specific objectives and deliverables, and the process is **iterative** — insights at later stages often force revisiting earlier ones.

**Stage 1 — Business Problem Framing:** Translate a business need into a well-defined data problem. Ask: What exactly are we trying to optimize? What is the current baseline? What would success look like? What decisions will be made based on the output? Define metrics (business metrics and ML metrics). Deliverable: project charter with problem statement, success criteria, and stakeholder alignment.

**Stage 2 — Data Collection:** Identify and acquire necessary data sources. Includes internal databases, third-party APIs, web scraping, sensor data, or manual collection. Assess data availability, access permissions, and cost. Deliverable: data source inventory with schema documentation.

**Stage 3 — EDA:** Explore data distributions, relationships, missing patterns, anomalies, and quality issues. Generate hypotheses. Deliverable: EDA report with visualizations and initial findings.

**Stage 4 — Data Cleaning:** Handle missing values (imputation, deletion, flagging), fix data types, remove or cap outliers, resolve inconsistencies, deduplicate. Deliverable: clean, validated dataset.

**Stage 5 — Feature Engineering:** Create predictive features from raw data — transformations, aggregations, encodings, interactions, domain-specific features. Select features using domain knowledge and statistical methods. Deliverable: feature set ready for modeling.

**Stage 6 — Model Selection:** Train multiple candidate models (baseline → simple → complex). Use cross-validation for robust performance estimates. Compare on validation metrics. Deliverable: shortlist of candidate models with performance profiles.

**Stage 7 — Hyperparameter Tuning:** Optimize model hyperparameters using grid search, random search, or Bayesian optimization. Validate tuned model on held-out validation set (or nested CV). Deliverable: final tuned model.

**Stage 8 — Evaluation:** Final evaluation on held-out test set. Assess not just overall metrics but disaggregated performance across segments. Check for calibration, fairness, and robustness. Deliverable: evaluation report with model card.

**Stage 9 — Deployment:** Package model (Docker, MLflow), deploy as API or batch inference, integrate with application, set up monitoring infrastructure. Deliverable: deployed model serving predictions.

**Stage 10 — Monitoring and Maintenance:** Track prediction distributions, feature distributions, data drift, concept drift, model performance over time. Set up automated retraining triggers and alerting for degradation. Deliverable: monitoring dashboard and retraining pipeline.

### Example

An e-commerce company tackles cart abandonment. **Stage 1**: "Predict which users will abandon their cart within 30 minutes so we can send a targeted discount." Success metric: cart abandonment rate reduction from 78% to 65%. **Stage 2**: Collect clickstream events, cart state changes, user profiles, historical purchase data. **Stage 3**: EDA reveals average time-to-abandon is 14 minutes, 40% of abandonment happens on mobile, price-sensitive users abandon most. **Stage 4**: Clean session timestamps, impute missing device types, remove bot traffic. **Stage 5**: Engineer features — session duration, pages viewed, cart value, discount history, time of day, device type, price sensitivity score. **Stage 6**: Compare logistic regression (baseline), XGBoost, and LightGBM. XGBoost wins with 0.85 PR-AUC. **Stage 7**: Tune max_depth, learning_rate, subsample via random search. **Stage 8**: Final evaluation: 0.87 PR-AUC on test set, 82% recall at 60% precision, performance consistent across mobile/desktop. **Stage 9**: Deploy as Flask API on Kubernetes with 100ms latency SLA. **Stage 10**: Monitor prediction distribution — after 3 months, drift in price sensitivity feature triggers retraining. Result: cart abandonment rate drops from 78% to 61%, exceeding the target.

### Interview Questions

**Q: What is the most common mistake in the data science workflow?**
A: **Jumping to modeling too early** — skipping or rushing Stages 1-4 (business framing, data collection, EDA, data cleaning). Teams often start with modeling because it is more interesting, but poor problem framing leads to building the wrong thing, and poor data quality makes any model unreliable. The sunk cost of a week of ETL and EDA is far less than two months building a model that doesn't address the right problem or fails in production. A related mistake is conflating correlation discovered in EDA with causation — exploration generates hypotheses, it does not confirm them.

**Q: Model complexity vs interpretability — how do you balance them?**
A: The balance depends on the use case. For high-stakes decisions (medical diagnosis, credit approval, criminal justice), interpretability is essential — you must explain why a decision was made. Use simple models (logistic regression, decision trees, GAMs) or post-hoc interpretation methods (SHAP, LIME). For low-stakes but high-leverage tasks (recommendation, ad ranking, content moderation), complex models (gradient boosting, deep learning) are justified for their accuracy gains. The strategy: always start with a simple, interpretable baseline to establish a performance floor and understand the data. Only add complexity when it provides meaningful accuracy gains that outweigh the interpretability loss.

**Q: How to detect concept drift in production?**
A: Concept drift means the relationship between features and target changes over time. Detection methods: (1) **monitor prediction distribution** — if the model's score distribution shifts significantly, it may indicate drift; (2) **monitor actuals** — when ground truth arrives with a delay, compare predicted vs actual via drifted performance metrics; (3) **domain classifier** — train a classifier to distinguish current production data from training data; high accuracy indicates drift; (4) **statistical tests** — compare feature distributions between a recent window and the training data using KS test or PSI. Automate monitoring with tools like Evidently AI, WhyLabs, or NannyML. When drift exceeds thresholds, trigger retraining or investigation.
