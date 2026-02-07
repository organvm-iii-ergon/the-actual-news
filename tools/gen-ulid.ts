import { ulid } from "ulid";

const count = Number(process.argv[2] ?? 1);

for (let i = 0; i < count; i++) {
  console.log(ulid());
}
