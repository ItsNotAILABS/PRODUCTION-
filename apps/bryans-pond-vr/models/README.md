# Local model assets

Bryan's Pond VR is configured for bundled Transformers.js models only.

Expected layout:

```text
models/
  fishing-state/
    config.json
    tokenizer.json
    tokenizer_config.json
    special_tokens_map.json
    onnx/
      model_quantized.onnx
  fishing-guide/
    config.json
    tokenizer.json
    tokenizer_config.json
    special_tokens_map.json
    generation_config.json
    onnx/
      model_q4.onnx
  catch-embedding/
    config.json
    tokenizer.json
    tokenizer_config.json
    special_tokens_map.json
    onnx/
      model_quantized.onnx
```

The model IDs in `ai/model-config.json` map directly to these folder names.

Remote model downloads are disabled in `src/local-intelligence.js`, so a missing local asset produces a controlled load error rather than falling back to the Hugging Face Hub.

## Convert with Optimum

Example:

```bash
python -m pip install "optimum[onnxruntime]" transformers
optimum-cli export onnx --model YOUR_MODEL ./models/fishing-guide
```

After export, quantize the ONNX files for Quest-class hardware and rename them to match the selected `dtype` convention used by Transformers.js.
