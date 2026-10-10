export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      shortCircuit: true,
      url: new URL("./cloudflare-mock.mjs", import.meta.url).href,
    };
  }
  return nextResolve(specifier, context);
}
