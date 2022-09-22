/**
 * Interpolate the string using given parameters.
 *
 * The string is interpolated as if it was a template literal but with only
 * the parameters available. Nested interpolation is also supported.
 */
export function interpolate(string, params) {
  const keys = Object.keys(params);
  const values = Object.values(params);

  const _interpolate = (s) => {
    const escaped = s.replace(/`/g, "\\`");
    return new Function(...keys, `return \`${escaped}\`;`)(...values);
  };

  // Use multiple passes if needed to support nested interpolation.
  let input;
  let result = string;
  do {
    input = result;
    result = _interpolate(input);
  } while (result !== input);
  return result;
}
