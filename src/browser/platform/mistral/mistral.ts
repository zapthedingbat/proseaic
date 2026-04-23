/*
https://docs.mistral.ai/api/endpoint/models#operation-list_models_v1_models_get

curl https://api.mistral.ai/v1/models \
 -X GET \
 -H 'Authorization: Bearer YOUR_APIKEY_HERE'

[
  {
    "id": "<model_id>",
    "capabilities": {
      "completion_chat": true,
      "completion_fim": false,
      "function_calling": false,
      "fine_tuning": false,
      "vision": false,
      "classification": false
    },
    "job": "<job_id>",
    "root": "open-mistral-7b",
    "object": "model",
    "created": 1756746619,
    "owned_by": "<owner_id>",
    "name": null,
    "description": null,
    "max_context_length": 32768,
    "aliases": [],
    "deprecation": null,
    "deprecation_replacement_model": null,
    "default_model_temperature": null,
    "TYPE": "fine-tuned",
    "archived": false
  }
]
*/