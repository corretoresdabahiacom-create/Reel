select created_date as referral_date, count(*) as referrals, sum(case when status in ('signed_up', 'activated', 'rewarded') then 1 else 0 end) as signups,
  sum(case when status = 'rewarded' then 1 else 0 end) as rewarded, sum(case when status = 'fraud' then 1 else 0 end) as fraud_blocked
from {{ ref('stg_referrals') }} group by created_date
