// Usage: node scripts/import-pois.mjs [path/to/pois.json]   (needs AWS creds + @aws-sdk/client-dynamodb installed)
import { readFileSync } from "node:fs";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const file = process.argv[2] ?? "data/pois.json";
const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? "eu-north-1" });
const pois = JSON.parse(readFileSync(file, "utf8"));
for (const p of pois) {
  await client.send(new PutItemCommand({ TableName: process.env.TABLE_NAME ?? "UnilorinPOIs", Item: marshall(p, { removeUndefinedValues: true }) }));
  console.log("imported", p.id);
}
