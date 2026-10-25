// Shared JSON output for every model (docs/DATA_MODEL.md S-1, S-3, S-4):
// `_id` becomes `id` (a string), `__v` is removed, and `passwordHash` is never included.
export function applyToJSON(schema) {
  schema.set('toJSON', {
    versionKey: false,
    transform(doc, ret) {
      if (ret._id !== undefined) {
        ret.id = String(ret._id);
        delete ret._id;
      }
      delete ret.passwordHash;
      return ret;
    },
  });
}
