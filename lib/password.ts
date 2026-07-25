import { hash, verify } from "@node-rs/argon2";

const options = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string) {
  return hash(password, options);
}

export function verifyPassword(hashValue: string, password: string) {
  return verify(hashValue, password);
}
