const fs = require('fs');

const banners = JSON.parse(fs.readFileSync('banners.json', 'utf8'));
const city = 'global';
const now = new Date();

let reasons = {
  status: 0,
  promotionType: 0,
  isHomepageVisible: 0,
  endDate: 0,
  targetCities: 0
};

const eligible = banners.filter((campaign) => {
  const validStatuses = ['approved', 'active'];
  if (!validStatuses.includes(campaign.status)) {
    reasons.status++;
    return false;
  }
  if (campaign.promotionType && campaign.promotionType !== 'banner') {
    reasons.promotionType++;
    return false;
  }
  if (campaign.isHomepageVisible === false) {
    reasons.isHomepageVisible++;
    return false;
  }
  
  if (campaign.endDate) {
    const end = new Date(campaign.endDate);
    if (!isNaN(end.getTime()) && end < now) {
      if (campaign.status !== 'active') {
         reasons.endDate++;
         return false;
      }
    }
  }
  
  if (campaign.targetCities && campaign.targetCities.length > 0 && city && city.toLowerCase() !== 'global') {
    const cityLower = city.trim().toLowerCase();
    const matchesCity = campaign.targetCities.some(
      (tc) => String(tc).trim().toLowerCase() === cityLower,
    );
    if (!matchesCity) {
       reasons.targetCities++;
       return false;
    }
  }
  return true;
});

console.log('Total banners:', banners.length);
console.log('Eligible banners:', eligible.length);
console.log('Exclusion reasons:', reasons);
