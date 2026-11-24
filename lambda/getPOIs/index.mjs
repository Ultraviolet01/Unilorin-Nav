import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME ?? "UnilorinPOIs";

export const handler = async (event) => {
  const { category, campus } = event.queryStringParameters ?? {};
  const items = [];
  let key;
  do {
    const r = await client.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey: key }));
    items.push(...(r.Items ?? []).map(unmarshall));
    key = r.LastEvaluatedKey;
  } while (key);
  const out = items.filter((p) => (!category || p.category === category) && (!campus || p.campus === campus));
  return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=300" }, body: JSON.stringify(out) };
};
