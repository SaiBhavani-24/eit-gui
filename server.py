from flask import Flask, request, jsonify
from validator import validate

app = Flask(__name__)

@app.route("/validate", methods=["POST"])
def validate_config():
    config = request.get_json()
    result = validate(config)
    return jsonify(result)

if __name__ == "__main__":
    app.run(debug=True)
