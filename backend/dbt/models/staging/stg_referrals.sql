with dedup as (select *, row_number() over (partition by referral_id order by _loaded_at desc) as rn from {{ source('raw', 'referrals') }})
select referral_id, referrer_pseudo, referred_pseudo, status, created_at, signed_up_at, activated_at, reward_granted_at, {{ xdb_date('created_at') }} as created_date from dedup where rn = 1
