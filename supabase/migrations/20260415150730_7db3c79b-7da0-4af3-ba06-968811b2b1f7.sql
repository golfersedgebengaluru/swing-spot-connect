INSERT INTO page_content (slug, title, content) VALUES
  ('booking-terms', 'Booking Terms & Conditions', '<h3>Cancellation Policy</h3>
<p><strong>No cancellations within 24 hours of the booking.</strong></p>
<p>If cancelled more than 24 hours in advance, you may choose one of the following:</p>
<ul>
<li><strong>Option 1 — Credit Note:</strong> Receive a credit note for the full amount, valid for rebooking within 30 days. This credit is non-transferable.</li>
<li><strong>Option 2 — Cash Refund:</strong> Request a cash refund, subject to a 10% cancellation fee.</li>
</ul>
<h3>Liability Disclaimer</h3>
<p>The centre is not responsible for any injuries, accidents, or health issues that may occur during the use of our facilities. By booking, you acknowledge and accept this.</p>
<h3>Booking Confirmation</h3>
<p>All bookings are subject to availability and confirmation. The centre reserves the right to modify or cancel bookings in case of unforeseen circumstances.</p>'),
  ('package-terms', 'Hour Package Terms', '<p><strong>Hour packages are non-refundable.</strong> Purchased hours remain valid as per the terms of the package and cannot be exchanged for cash or transferred to another member.</p>')
ON CONFLICT (slug) DO NOTHING;