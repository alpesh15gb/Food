# Supperclub Direct — Design Direction

## Three initial approaches

### 1. Market Table
**Very Brief Intro:** A tactile, contemporary food market aesthetic inspired by hand-stamped grocer labels and the warm materials of a neighborhood kitchen. It makes direct ordering feel personal rather than transactional.

**Probability:** 0.07

### 2. Neon Counter
**Very Brief Intro:** A late-night diner interface built around dark surfaces, bright service indicators, and illuminated food photography. It would emphasize speed and energy for delivery-heavy restaurants.

**Probability:** 0.04

### 3. Editorial Pantry
**Very Brief Intro:** A quiet, magazine-inspired ordering experience with generous whitespace, oversized dish names, and delicate botanical details. It frames menu choices as a considered, premium selection.

**Probability:** 0.08

---

## Chosen approach: Market Table

### Design Movement
Contemporary **new vernacular**—the handmade warmth and casual confidence of a favorite neighborhood food counter, sharpened by a modern editorial product interface.

### Core Principles
1. Keep choice-making direct: clear hierarchy, persistent cart access, generous touch targets, and no decorative detours in the ordering path.
2. Use crafted utility: label-like metadata, inset surfaces, and rounded product frames should feel tangible without looking nostalgic or cluttered.
3. Let food do the emotional work: warm photography, restrained surfaces, and small moments of kinetic feedback make ordering feel appetizing and dependable.
4. Make important states unmistakable: availability, delivery progress, prices, and calls to action use both language and differentiated structure—not color alone.

### Color Philosophy
The base is a warm rice-paper neutral, so the app feels like a restaurant’s own place rather than an anonymous marketplace. **Tamarind Red** is the ownable action color: aromatic, energetic, and highly legible for order actions. Olive brings calm to veg and fulfillment signals; toasted apricot adds subtle food warmth; charcoal grounds long reading and desktop navigation.

### Layout Paradigm
The mobile experience follows a deliberate **service counter** rhythm: restaurant story at the top, service context (address) next, then a horizontal menu rail and a vertical stream of dishes. Desktop expands this into a three-zone counter—category index on the left, dish stream in the center, order ticket on the right—rather than a generic centered grid.

### Signature Elements
1. **Stamped metadata chips:** compact, tactile labels for ETA, fees, vegetarian status, availability, and offer states.
2. **Ticket-edge surfaces:** cart and checkout summaries have subtle notched corners and dotted dividers that suggest a kitchen order ticket.
3. **Ingredients linework:** a restrained botanical/ingredient motif appears as very low-contrast texture in hero and empty states.

### Interaction Philosophy
Interactions should feel reassuringly immediate. Adds acknowledge with a cart count and a short success message; choices open from the bottom on mobile, keeping the user spatially close to the food they selected. All routes retain a visible path back to browsing, and every non-working integration state is represented as an intentional demo status rather than a dead end.

### Animation
Use 140–220 ms cubic-bezier(0.23, 1, 0.32, 1) transforms and opacity transitions. Menu cards shift up by 2 px on hover, active filters settle with a small horizontal slide, cart acknowledgements use a brief scale from 0.96, and sheets rise with opacity rather than springing from zero. Respect `prefers-reduced-motion` by removing nonessential entrance and hover motion.

### Typography System
**DM Serif Display** carries dish names and emotional state headings, giving the product a hospitality-led voice. **Manrope** supports all operational UI—prices, metadata, filters, forms, and order details—with compact tracking at small sizes. Display type is never used for dense content; operational copy is never set below 12 px.

### Brand Essence
**A direct restaurant ordering counter for guests who want a familiar, faster way to bring their favorite local meals home.**

Personality: **warm, exacting, unhurried**.

### Brand Voice
Headlines are concise and appetizing; calls to action are clear and action-led; microcopy anticipates the customer’s next concern without being chatty.

Example lines: “Your usual, without the detour.” and “Dinner’s in good hands — 30–40 min.”

### Wordmark & Logo
The wordmark is a custom high-contrast serif treatment with a small offset underline resembling the lower edge of a serving tray. The icon is an abstract **folded napkin / order ticket** mark with one clipped corner, recognizable even without the name.

### Signature Brand Color
**Tamarind Red — #C84630**

## Style Decisions

- Every transactional total, confirmation ETA, and order-progress surface uses the ticket-edge geometry, dotted rules, or a stamped label so direct ordering retains the tactile counter identity.
- Ingredient linework is a required low-contrast background texture in confirmation, tracking, and service-summary states; it keeps appetite present beyond menu browsing.
- All state copy remains calm, warm, and counter-led. Generic system language is replaced by concise operational reassurance such as “Dinner’s in good hands.”
