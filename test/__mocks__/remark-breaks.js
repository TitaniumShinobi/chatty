// Jest mock for remark-breaks (ESM package used by react-markdown)
function remarkBreaks() {
  return (tree) => tree;
}
module.exports = remarkBreaks;
