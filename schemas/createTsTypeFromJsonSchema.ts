import { compileFromFile } from "json-schema-to-typescript";
import { promises as fs } from "fs";
import path from "path";

const jsonSchemaFilePath: string = path.join(__dirname, "..", "schemas", "config.schema.json");
const outputFilePath: string = path.join(__dirname, "..", "schemas", "config.schema.ts");

compileFromFile(jsonSchemaFilePath, { style: { tabWidth: 4 } })
    .then((ts) => fs.writeFile(outputFilePath, ts))
    .catch((error) => { console.error(error); });
