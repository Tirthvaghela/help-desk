import mongoose from 'mongoose';

export async function connectDB(uri) {
  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}
