// Jest mock for rehype-raw (ESM package)
function rehypeRaw() {
  return (tree) => tree;
}
module.exports = rehypeRaw;
