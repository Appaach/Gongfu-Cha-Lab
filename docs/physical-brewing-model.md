# Physical brewing model: calibration and limits

## What the model currently predicts

The simulator advances a shared tea-leaf/liquid state across the zero infusion and subsequent pours. It tracks four groups: L-theanine, caffeine, catechins (split into EGC/EGCG pools), and polysaccharides. The extraction process uses two available leaf pools (“fast” and “slow”), temperature-dependent effective first-order rates, cooling, liquid carry-over, and a mass-balance diagnostic.

For an effective rate referenced to 85 °C, the Arrhenius temperature adjustment is:

\[
k(T) = k_{85}\exp\left[-\frac{E_a}{R}\left(\frac{1}{T}-\frac{1}{T_{85}}\right)\right].
\]

In the fitted two-pool approximation, the extracted fraction at constant temperature is:

\[
F(t)=f\left(1-e^{-1.8kt}\right)+(1-f)\left(1-e^{-0.45kt}\right).
\]

The live simulator integrates the effective rate over the cooling profile instead of holding the brew at a single constant temperature. The fit diagnostic uses a fixed \(f=0.45\) so the published mean conditions can be compared consistently.

## Literature reference set

The caffeine and L-theanine reference means come from Ayakdaş and Ağagündüz, *Foods* 2025, 14(13), 2313, DOI [10.3390/foods14132313](https://doi.org/10.3390/foods14132313).

The study used 2 g of loose-leaf tea in 200 mL of ultrapure water, brewed at 80 °C or 100 °C for 2, 5, or 10 minutes. Compounds were quantified by reversed-phase HPLC. The six groups represented were green, white, yellow, oolong, black, and Pu-erh tea.

| Archetype | Caffeine samples | L-theanine samples | Caffeine RMSE (mg/200 mL) | L-theanine RMSE (mg/200 mL) |
|---|---:|---:|---:|---:|
| Green | 12 | 4 | 1.52 | 0.65 |
| White | 5 | 3 | 3.67 | 0.28 |
| Yellow | 2 | 2 | 2.86 | 0.52 |
| Oolong | 4 | 3 | 1.14 | 0.47 |
| Black | 41 | 6 | 0.93 | 1.11 |
| Pu-erh | 2 | 2 | 1.82 | 0.10 |

RMSE is the residual error for the six published category means used during the fit. It is **not** a confidence interval, an independent validation score, or an estimate of error for an individual tea lot. Small sample counts and high variance in some categories (especially yellow and Pu-erh) mean those priors should be treated cautiously.

The initial rates and extractable pool values in \`src/data/teaExtractionCalibration.ts\` are effective coefficients fitted to these infusion means with the model's two-pool shape. They should not be interpreted as a measured total chemical composition of dry leaves.

## What is not yet calibrated

- Catechin/EGC/EGCG and polysaccharide kinetics remain estimate-based archetype priors.
- Tea-specific leaf-liquid retention and most vessel heat-capacity/cooling constants remain estimates unless a profile explicitly supplies measured/calibrated values.
- Water hardness only changes an individual compound when a corresponding \`waterResponseByHardness\` calibration exists. The model intentionally avoids a universal hardness multiplier.
- Sensory scores and optimization utility are engineering proxies, not a trained tasting-panel model.
- Short Gongfu pours are much shorter than the 2–10-minute laboratory infusions used for the reference set. The fitted caffeine/theanine priors are therefore an extrapolation for those pours and require dedicated short-pour experiments.

## Optimizer behavior

The outer optimizer searches volume, dry-leaf mass, base temperature, and steep count by coordinate descent against the shared physical simulation. A second search refines individual steep times and, when enabled, individual temperatures. User-fixed fields and manually entered steep times/temperatures are treated as hard constraints. The selected brewing method, vessel, water hardness, and root fraction are conditions to simulate, not parameters silently changed by the optimizer.

Because the sensory utility is not calibrated to human preference, an optimized recipe is a model-based comparison—not a guarantee of the best tasting cup.

## Zero infusion policy

Whether stage #0 exists is derived from the tea-specific rule returned by the rinse-info function and the optional zero-infusion profile on the tea. A goal such as “reduce bitterness” cannot add a rinse to a tea that does not need one. Explicit profile policy can mark a rinse 'enabled'/'recommended' or 'disabled'; 'optional' does not insert one automatically. There is no simulator-level zero-infusion checkbox. Required rinses are shown automatically, and user-entered time cannot silently remove them.

## Validation command

\`\`\`bash
npm run lint
npm run test:physics
npm run build
\`\`\`

The GitHub Actions workflow runs the same checks with Node.js 24. The repository's existing package-lock.json is out of sync with package.json, so CI currently uses npm install rather than npm ci; dependency-lock synchronization and the existing npm audit findings remain separate maintenance work.
