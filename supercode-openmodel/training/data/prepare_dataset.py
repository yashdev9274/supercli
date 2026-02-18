import os
from datasets import load_dataset, concatenate_datasets
from dill import load

def prepare_coding_dataset():
    datasets=[]

    code_alpaca = load_dataset("HuggingFaceH4/CodeAlpaca_20K", split="train", token=os.getenv("HF_TOKEN"))
    datasets.append(code_alpaca)

    # openCodeReasoning

    reasoning = load_dataset("nvidia/OpenCodeReasoning","split_0", token=os.getenv("HF_TOKEN"))
    reasoning=reasoning["split_0"]
    reasoning= reasoning.filter(lambda x: "code" in x.get("tags", []) if x.get("tags") else False)
    reasoning=reasoning.select(range(30000))
    datasets.append(reasoning)

    # combine

    combined = concatenate_datasets(datasets)
    combined = combined.shuffle(seed=42)

    # limit to 50k samples

    # combined = combined.select(range(50000))

    # split
    split = combined.train_test_split(test_size=0.05)

    return split["train"], split["test"]

if __name__ == "__main__":
    train, val = prepare_coding_dataset()
    train.to_json("training/data/train.jsonl", orient = "records", lines=True)
    val.to_json("training/data/val.jsonl", orient="records", lines=True)
    print(f"Train: {len(train)}, Val:{len(val)}")
