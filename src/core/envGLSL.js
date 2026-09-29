// Shared analytic "dim living room at night" used for reflections on glass and the water surface.
export const ENV_GLSL = /* glsl */ `
vec3 roomEnv(vec3 d) {
  vec3 c = vec3(0.010, 0.012, 0.017) + vec3(0.02, 0.026, 0.04) * smoothstep(-0.4, 0.9, d.y);
  vec3 ld = normalize(vec3(-0.75, 0.40, 0.75));
  c += vec3(1.0, 0.55, 0.24) * 2.6 * pow(max(dot(d, ld), 0.0), 90.0);
  c += vec3(1.0, 0.50, 0.22) * 0.30 * pow(max(dot(d, ld), 0.0), 7.0);
  vec3 wd = normalize(vec3(0.85, 0.28, 0.5));
  c += vec3(0.30, 0.42, 0.75) * 0.9 * smoothstep(0.90, 0.985, dot(d, wd));
  c += vec3(0.16, 0.24, 0.45) * 0.25 * pow(max(dot(d, wd), 0.0), 5.0);
  vec3 bd = normalize(vec3(0.0, 0.85, 0.1));
  float strip = smoothstep(0.86, 0.97, dot(d, bd)) * smoothstep(0.55, 0.15, abs(d.x));
  c += vec3(0.95, 1.05, 1.35) * 5.0 * strip;
  c += vec3(0.5, 0.42, 0.34) * 0.35 * smoothstep(0.07, 0.0, abs(d.y - 0.10)) * smoothstep(-0.2, 0.9, d.x);
  // far (back) wall, lit faintly by tank spill and the floor lamp on the right
  c += vec3(0.05, 0.075, 0.10) * 0.55 * smoothstep(0.0, -0.9, d.z) * smoothstep(-0.1, 0.5, d.y + 0.3);
  c += vec3(1.0, 0.5, 0.2) * 0.10 * pow(max(dot(d, normalize(vec3(0.75, 0.2, -0.6))), 0.0), 5.0);
  return c;
}
`;
