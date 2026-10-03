// Driver data the Figma frames show and the API does not return yet (docs/IMPLEMENTATION.md,
// Driver backend gaps). Everything else on the driver screens comes from the API or the phone's
// own outbox. Screens read these through the functions below, so each one can be swapped for an
// API call without touching the screen.

export interface OutletContact {
  /** Who receives the goods at the outlet (DR03 contact row, DR04 "Received by"). */
  name: string;
  role: string;
  phone: string;
  /** How to reach the unloading point (DR03 access row). */
  access: string;
}

// DR03 `2046:5243` shows "T. Jayasinghe · Store manager · 2 staff ready" and "Enter from Hill St."
const CONTACTS: readonly OutletContact[] = [
  {
    name: 'T. Jayasinghe',
    role: 'Store manager · 2 staff ready',
    phone: '+94 81 555 0171',
    access: 'Enter from Hill St.',
  },
  {
    name: 'N. Perera',
    role: 'Store manager · 1 staff ready',
    phone: '+94 81 555 0170',
    access: 'Unload at the side gate',
  },
  {
    name: 'M. Fernando',
    role: 'Assistant manager · 2 staff ready',
    phone: '+94 81 555 0158',
    access: 'Ring the bell at the rear shutter',
  },
  {
    name: 'S. Wickramasinghe',
    role: 'Store manager · 3 staff ready',
    phone: '+94 81 555 0144',
    access: 'Security opens the service lane',
  },
  {
    name: 'R. Dissanayake',
    role: 'Shift supervisor · 1 staff ready',
    phone: '+94 81 555 0139',
    access: 'Park in the marked loading bay',
  },
];

/** The same outlet always gets the same contact, whatever outlets the seed creates. */
export function outletContact(outletId: string): OutletContact {
  let sum = 0;
  for (const char of outletId) sum += char.charCodeAt(0);
  return CONTACTS[sum % CONTACTS.length] as OutletContact;
}

// DR04a `2046:5550` "Call dispatcher" and DR08 `2106:10764` "Peliyagoda planning office".
export const DISPATCH_OFFICE = {
  name: 'Peliyagoda planning office',
  phone: '+94 11 555 0100',
} as const;

// DR08 "This week · 19 of 20 on time": one dot per stop, in delivery order.
export const WEEK_STOPS: readonly boolean[] = Array.from(
  { length: 20 },
  (_, index) => index !== 13,
);

export const telHref = (phone: string) => `tel:${phone.replace(/\s/g, '')}`;
