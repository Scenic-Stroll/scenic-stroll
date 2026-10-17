import { describe, expect, it } from 'vitest';

import { parseTrafficNews } from './traffic-news.ts';

// First message copied from the real feed on 2026-10-18; the second is the same shape with a
// position and escaped characters, as the feed sends for open incidents.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<list xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <message>
    <INCIDENT_NUMBER>IN-26-07615</INCIDENT_NUMBER>
    <INCIDENT_HEADING_EN>Road Incident</INCIDENT_HEADING_EN>
    <INCIDENT_HEADING_CN>道路事故</INCIDENT_HEADING_CN>
    <LOCATION_EN>San Tin Interchange</LOCATION_EN>
    <LOCATION_CN>新田交匯處</LOCATION_CN>
    <DISTRICT_EN/>
    <ANNOUNCEMENT_DATE>2026-10-17T18:29:00</ANNOUNCEMENT_DATE>
    <INCIDENT_STATUS_EN>CLOSED</INCIDENT_STATUS_EN>
    <ID>148134</ID>
    <CONTENT_EN>Part of the lanes of San Tin Interchange  which was closed due to road incident is re-opened to all traffic. </CONTENT_EN>
    <CONTENT_CN>較早前因道路事故而封閉的新田交匯處的部份行車線現已解封。</CONTENT_CN>
    <LATITUDE/>
    <LONGITUDE/>
  </message>
  <message>
    <INCIDENT_NUMBER>IN-26-07620</INCIDENT_NUMBER>
    <INCIDENT_HEADING_EN>Traffic Accident</INCIDENT_HEADING_EN>
    <LOCATION_EN>Tat Chee Avenue &amp; Cornwall Street</LOCATION_EN>
    <DISTRICT_EN>Sham Shui Po</DISTRICT_EN>
    <DIRECTION_EN>Kowloon Tong bound</DIRECTION_EN>
    <ANNOUNCEMENT_DATE>2026-10-18T08:05:00</ANNOUNCEMENT_DATE>
    <INCIDENT_STATUS_EN>NEW</INCIDENT_STATUS_EN>
    <ID>148140</ID>
    <CONTENT_EN>One lane is closed.</CONTENT_EN>
    <LATITUDE>22.3389</LATITUDE>
    <LONGITUDE>114.1741</LONGITUDE>
  </message>
</list>`;

describe('TD special traffic news', () => {
  it('reads each message, in English and Chinese', () => {
    const [closed, open] = parseTrafficNews(XML);
    expect(closed).toMatchObject({
      id: '148134',
      heading_zh: '道路事故',
      location_en: 'San Tin Interchange',
      active: false,
      point: null,
      announced_at: '2026-10-17T18:29:00+08:00',
    });
    // Double spaces squashed, trailing space trimmed.
    expect(closed!.content_en).toBe(
      'Part of the lanes of San Tin Interchange which was closed due to road incident is re-opened to all traffic.',
    );
    expect(open).toMatchObject({
      location_en: 'Tat Chee Avenue & Cornwall Street',
      district_en: 'Sham Shui Po',
      active: true,
      point: { lat: 22.3389, lng: 114.1741 },
    });
  });

  it('copes with an empty list and rejects something that is not the feed', () => {
    expect(parseTrafficNews('<list></list>')).toEqual([]);
    expect(() => parseTrafficNews('<html>Service unavailable</html>')).toThrow();
  });

  it('ignores positions outside Hong Kong', () => {
    const zero = XML.replace('22.3389', '0').replace('114.1741', '0');
    expect(parseTrafficNews(zero)[1]!.point).toBeNull();
  });
});
