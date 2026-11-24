# Walk sharing: what we collect and why

> **Status: sharing is switched OFF in the app** (build flag `NEXT_PUBLIC_WALK_SHARING`, unset). Walks are kept on the phone only. Turn it on only after the points at the bottom are settled.

Plain-language note that matches the pop-up in the app. Keep the two in step.

**Why:** the map's footpaths are traced from satellite images and have not been walked. Real walks let the team add the paths people actually use.

**Only if you choose it.** The first time you tick "Save my walk", the app asks. The choices are *Share my walks* (uploads automatically), *Keep on my phone only*, or *Not now*. Recording only happens while you use **Start**.

**What is saved when you share:** the GPS points of the walk (the first 40 m are cut off, so where you started is not shared), its time and length, whether it was on foot or by cab, the id of the place you were going to, and a random code made on your phone. This is *pseudonymous*, not anonymous: a GPS trail can still point to a person, which is why the data is handled as personal data.

**What is not saved:** your name, phone number, email, contacts or device identifiers. Nothing is recorded when you are not using Start. We do not try to identify or contact anyone.

**Who can see it:** only the map team, through the AWS project the app runs in. Shared walks are reviewed on a map before any path is added to the public map.

**How long:** walks are deleted automatically after 12 months.

**Your control:** open Directions, tick "Save my walk" and choose "Change walk sharing". "Stop sharing and delete my walks" deletes everything shared from your phone's random code and turns sharing off. If you clear the app's data you lose that code and can no longer delete earlier walks yourself; they still expire after 12 months.

**Location data is personal data.** Before publishing to a wider audience, check this note with the university (and, if needed, a lawyer) against the Nigeria Data Protection Act 2023.

## Open points for the university / a lawyer
Not legal advice; a checklist of what to settle before a wider launch.
1. **Who is the data controller?** The pop-up says "the map team". Name the responsible person or office and a contact email, and show it in the pop-up.
2. **Lawful basis and consent wording.** We rely on consent (opt-in, off by default, withdrawable). Confirm the wording is enough, including for students under 18.
3. **Cross-border transfer.** Shared walks are stored in AWS in Stockholm (eu-north-1), outside Nigeria. Confirm what the Act requires for that and whether the notice must say so (it does not yet).
4. **Registration and assessments.** Check whether the project must register with the Nigeria Data Protection Commission and whether a data protection impact assessment is needed for location data.
5. **Rights.** Deletion and withdrawal are in the app. Access (a copy of your data) and correction are not; decide how requests will be handled.
6. **Retention.** Walks expire after 12 months. Confirm that period, and what happens to paths already merged into the public map (they are no longer tied to a person).
7. **Breach plan.** Who is told, and how fast, if the table is ever exposed.
