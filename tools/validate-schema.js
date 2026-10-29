#!/usr/bin/env node

/**
 * Schema and Example Project Validator for Editing Mechanics Engine
 */

const fs = require('fs');
const path = require('path');

function validateType(val, type) {
  if (type === 'string') return typeof val === 'string';
  if (type === 'integer') return Number.isInteger(val);
  if (type === 'number') return typeof val === 'number';
  if (type === 'boolean') return typeof val === 'boolean';
  if (type === 'object') return val !== null && typeof val === 'object' && !Array.isArray(val);
  if (type === 'array') return Array.isArray(val);
  return true;
}

function validateObject(data, schema, rootSchema, pathStr = '$') {
  const errors = [];

  if (schema.$ref) {
    const refKey = schema.$ref.replace('#/$defs/', '');
    const refSchema = rootSchema.$defs[refKey];
    if (!refSchema) {
      errors.push(`${pathStr}: Unresolved ref ${schema.$ref}`);
      return errors;
    }
    return validateObject(data, refSchema, rootSchema, pathStr);
  }

  if (schema.type && !validateType(data, schema.type)) {
    errors.push(`${pathStr}: Expected type ${schema.type}, got ${typeof data}`);
    return errors;
  }

  if (schema.const !== undefined && data !== schema.const) {
    errors.push(`${pathStr}: Expected const "${schema.const}", got "${data}"`);
  }

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`${pathStr}: Value "${data}" not in enum [${schema.enum.join(', ')}]`);
  }

  if (schema.required && Array.isArray(schema.required)) {
    for (const req of schema.required) {
      if (data[req] === undefined) {
        errors.push(`${pathStr}: Missing required property "${req}"`);
      }
    }
  }

  if (schema.properties && typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (data[key] !== undefined) {
        errors.push(...validateObject(data[key], propSchema, rootSchema, `${pathStr}.${key}`));
      }
    }
  }

  if (schema.items && Array.isArray(data)) {
    data.forEach((item, idx) => {
      errors.push(...validateObject(item, schema.items, rootSchema, `${pathStr}[${idx}]`));
    });
  }

  return errors;
}

function runValidation() {
  console.log('====================================================');
  console.log('  Editing Mechanics Engine Schema & Project Validator');
  console.log('====================================================\n');

  const schemaPath = path.resolve(__dirname, '../schema/eme-project.v1.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  console.log(`✅ Loaded Canonical Schema: ${schema.title} (${schema.$id})`);

  const examples = [
    'examples/benchmark-a-motion-graphics.json',
    'examples/benchmark-b-xray-compositing.json',
  ];

  let totalErrors = 0;

  for (const exRel of examples) {
    const exPath = path.resolve(__dirname, '..', exRel);
    if (!fs.existsSync(exPath)) {
      console.error(`❌ Example not found: ${exRel}`);
      totalErrors++;
      continue;
    }

    const exData = JSON.parse(fs.readFileSync(exPath, 'utf8'));
    const errors = validateObject(exData, schema, schema);

    if (errors.length === 0) {
      console.log(`✅ PASS: ${exRel} conforms strictly to ${schema.title}`);
      console.log(`   - Canvas: ${exData.canvas.width}x${exData.canvas.height} (${exData.canvas.aspectRatio})`);
      console.log(`   - Duration: ${exData.timebase.durationTicks} ticks (${exData.timebase.durationTicks / exData.timebase.ticksPerSecond}s @ ${exData.timebase.fps.numerator}fps)`);
      console.log(`   - Tracks: ${exData.tracks.length} | Clips: ${exData.clips.length} | Assets: ${exData.assets.length}`);
    } else {
      console.error(`❌ FAIL: ${exRel} has validation errors:`);
      errors.forEach((err) => console.error(`   - ${err}`));
      totalErrors += errors.length;
    }
    console.log('');
  }

  if (totalErrors === 0) {
    console.log('🎉 All schema and example validation checks passed with 0 errors.');
    process.exit(0);
  } else {
    console.error(`Validation failed with ${totalErrors} error(s).`);
    process.exit(1);
  }
}

if (require.main === module) {
  runValidation();
}

module.exports = { validateObject };
