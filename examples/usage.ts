import { agental } from "../sdk/client";

async function main() {
  const api = agental();

  const { castings } = await api.castings.list();
  console.log(`${castings.length} open castings`);

  if (castings[0]) {
    const { casting } = await api.castings.get(castings[0].id);
    console.log("first:", casting.title);
  }

  await api.leads.create({ email: "someone@example.com", kind: "talent" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
