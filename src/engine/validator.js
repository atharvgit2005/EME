/** Dependency-free validation of the JSON Schema vocabulary used by EME contracts. */
const { isDeepStrictEqual } = require('node:util');
function validateType(value,type) {
  if (Array.isArray(type)) return type.some(t=>validateType(value,t));
  switch(type) {
    case 'null':return value===null;
    case 'string':return typeof value==='string';
    case 'integer':return Number.isSafeInteger(value);
    case 'number':return typeof value==='number' && Number.isFinite(value);
    case 'boolean':return typeof value==='boolean';
    case 'object':return value!==null && typeof value==='object' && !Array.isArray(value);
    case 'array':return Array.isArray(value);
    default:return false;
  }
}
function validDateTime(value) {
  const match=/^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [year,month,day,hour,minute,second]=match.slice(1,7).map(Number);
  const leap=year%4===0 && (year%100!==0 || year%400===0);
  return month>=1 && month<=12 && day>=1 && day<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1] && hour<24 && minute<60 && second<60 && (!match[7] || (Number(match[8])<24 && Number(match[9])<60));
}
function validateObject(data,schema,rootSchema=schema,pathStr='$') {
  if(schema===true)return [];
  if(schema===false)return [`${pathStr}: Schema forbids this value`];
  if(!schema || typeof schema!=='object')return [`${pathStr}: Invalid schema`];
  const errors=[];
  if(schema.$ref) {
    if(!schema.$ref.startsWith('#/'))return [`${pathStr}: Unresolved ref ${schema.$ref}`];
    const reference=schema.$ref.slice(2).split('/').reduce((v,k)=>v?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],rootSchema);
    if(reference===undefined)return [`${pathStr}: Unresolved ref ${schema.$ref}`];
    errors.push(...validateObject(data,reference,rootSchema,pathStr));
  }
  if(schema.type && !validateType(data,schema.type))return [...errors,`${pathStr}: Expected type ${schema.type}, got ${typeof data}`];
  if(Object.hasOwn(schema,'const') && !isDeepStrictEqual(data,schema.const))errors.push(`${pathStr}: Expected const ${JSON.stringify(schema.const)}`);
  if(schema.enum && !schema.enum.some(v=>isDeepStrictEqual(v,data)))errors.push(`${pathStr}: Value not in enum ${JSON.stringify(schema.enum)}`);
  if(validateType(data,'object')) {
    for(const name of schema.required || [])if(!Object.hasOwn(data,name))errors.push(`${pathStr}: Missing required property "${name}"`);
    for(const name of Object.keys(data)) {
      if(Object.hasOwn(schema.properties || {},name))errors.push(...validateObject(data[name],schema.properties[name],rootSchema,`${pathStr}.${name}`));
      else if(schema.additionalProperties===false)errors.push(`${pathStr}: Additional property "${name}" forbidden`);
      else if(schema.additionalProperties && typeof schema.additionalProperties==='object')errors.push(...validateObject(data[name],schema.additionalProperties,rootSchema,`${pathStr}.${name}`));
    }
  }
  if(Array.isArray(data)) {
    if(schema.minItems!==undefined && data.length<schema.minItems)errors.push(`${pathStr}: minItems ${schema.minItems}`);
    if(schema.maxItems!==undefined && data.length>schema.maxItems)errors.push(`${pathStr}: maxItems ${schema.maxItems}`);
    if(schema.items!==undefined)data.forEach((item,i)=>errors.push(...validateObject(item,schema.items,rootSchema,`${pathStr}[${i}]`)));
  }
  if(typeof data==='string') {
    if(schema.minLength!==undefined && [...data].length<schema.minLength)errors.push(`${pathStr}: minLength ${schema.minLength}`);
    if(schema.pattern!==undefined && !new RegExp(schema.pattern,'u').test(data))errors.push(`${pathStr}: pattern ${schema.pattern}`);
    if(schema.format!==undefined && (schema.format!=='date-time' || !validDateTime(data)))errors.push(`${pathStr}: Invalid or unsupported format ${schema.format}`);
  }
  if(typeof data==='number') {
    if(!Number.isFinite(data))errors.push(`${pathStr}: Non-finite number`);
    if(schema.minimum!==undefined && data<schema.minimum)errors.push(`${pathStr}: Value ${data} must be >= ${schema.minimum}`);
    if(schema.maximum!==undefined && data>schema.maximum)errors.push(`${pathStr}: Value ${data} must be <= ${schema.maximum}`);
    if(schema.exclusiveMinimum!==undefined && data<=schema.exclusiveMinimum)errors.push(`${pathStr}: Value ${data} must be > ${schema.exclusiveMinimum}`);
  }
  return errors;
}
module.exports={validateObject,validateType};
