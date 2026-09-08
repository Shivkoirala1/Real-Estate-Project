import React, { useEffect, useState } from "react";
import { getWalletData } from "../../services/rewardService";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

const levelStyles = {
  Bronze: { chip: "bg-[#CD7F32]/15 text-[#8a5a22]", bar: "bg-[#CD7F32]" },
  Silver: { chip: "bg-slate-muted/15 text-slate-ink", bar: "bg-slate-muted" },
  Gold: { chip: "bg-brass/15 text-brass-dark", bar: "bg-brass" },
  Platinum: { chip: "bg-sage-light text-sage", bar: "bg-sage" },
  Diamond: { chip: "bg-navy/10 text-navy", bar: "bg-navy" },
};

const actionIcon = {
  ACCOUNT_REGISTER: "🎉",
  EMAIL_VERIFY: "✅",
  PHONE_VERIFY: "📱",
  PROFILE_COMPLETE: "🧾",
  PROPERTY_SAVE: "❤️",
  PROPERTY_SHARE: "🔗",
  PROPERTY_VISIT_BOOK: "🗓️",
  SITE_VISIT_COMPLETE: "🏠",
  PROPERTY_BUY: "🔑",
  PROPERTY_SELL: "💰",
  REFERRAL_ACCOUNT: "🤝",
  REFERRAL_SALE: "🚀",
  REVIEW_WRITE: "⭐",
  DAILY_LOGIN: "📅",
  LOGIN_STREAK_7DAY: "🔥",
  BIRTHDAY_BONUS: "🎂",
};

const Wallet = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
      const data = await getWalletData(1, 20);
      setWallet(data.wallet);
      setTransactions(data.transactions);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load your wallet.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-5 md:px-8 py-16 text-slate-muted">
        Loading your wallet...
      </div>
    );
  }

  if (error || !wallet) {
    return (
      <div className="max-w-4xl mx-auto px-5 md:px-8 py-16 text-brick">
        {error || "Something went wrong."}
      </div>
    );
  }

  const { xp, ycCoin, level, nextLevel, levels } = wallet;
  const style = levelStyles[level] || levelStyles.Bronze;

  // Progress bar within the CURRENT level's band (not toward Diamond overall)
  const currentLevelDef = levels.find((l) => l.name === level);
  const nextLevelDef = nextLevel
    ? levels.find((l) => l.name === nextLevel.name)
    : null;
  const bandStart = currentLevelDef?.min ?? 0;
  const bandEnd = nextLevelDef?.min ?? bandStart + 1;
  const progressPct = nextLevel
    ? Math.min(((xp - bandStart) / (bandEnd - bandStart)) * 100, 100)
    : 100;

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-8 py-16">
      <p className="eyebrow mb-2">Youth Rewards</p>
      <h1 className="text-4xl mb-8">My Wallet</h1>

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        <div className="bg-navy rounded-sm p-6 text-ivory">
          <p className="text-xs uppercase tracking-wide text-ivory/60 mb-2">
            YC Balance
          </p>
          <p className="font-display text-3xl text-brass-light">
            {ycCoin.toLocaleString()} <span className="text-lg">YC</span>
          </p>
          <p className="text-xs text-ivory/50 mt-2">
            Youth Coin — spendable rewards
          </p>
        </div>
        <div className="border border-navy/10 rounded-sm p-6">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">
            Lifetime XP
          </p>
          <p className="font-display text-3xl text-navy">
            {xp.toLocaleString()}
          </p>
          <p className="text-xs text-slate-muted mt-2">
            Never decreases — determines your level
          </p>
        </div>
        <div className="border border-navy/10 rounded-sm p-6">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">
            Current Level
          </p>
          <span
            className={`inline-block font-display text-lg px-3 py-1 rounded-sm ${style.chip}`}
          >
            {level}
          </span>
        </div>
      </div>

      {/* Referral code */}
      {user?.referralCode && (
        <div className="bg-navy rounded-sm p-6 mb-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-display text-lg text-ivory mb-1">
              Refer a friend, earn more YC
            </p>
            <p className="text-sm text-ivory/60">
              You earn 200 YC when they join, and 5,000 YC if they later buy a
              property.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <code className="bg-white/10 text-brass-light text-sm font-semibold px-3 py-2 rounded-sm tracking-wide">
              {user.referralCode}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/register?ref=${user.referralCode}`,
                );
                showToast("Referral link copied");
              }}
              className="btn-gold text-xs px-4 py-2.5"
            >
              Copy link
            </button>
          </div>
        </div>
      )}

      {/* Level progress */}
      <div className="border border-navy/10 rounded-sm p-6 md:p-8 mb-12">
        <div className="flex items-center justify-between mb-3">
          <p className="font-display text-lg text-navy">Level progress</p>
          {nextLevel ? (
            <p className="text-sm text-slate-muted">
              {nextLevel.xpNeeded.toLocaleString()} XP to {nextLevel.name}
            </p>
          ) : (
            <p className="text-sm text-brass font-medium">
              Highest level reached 🎊
            </p>
          )}
        </div>
        <div className="w-full h-3 bg-parchment rounded-full overflow-hidden">
          <div
            className={`h-full ${style.bar} transition-all`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-2 mt-5">
          {levels.map((lvl) => (
            <span
              key={lvl.name}
              className={`text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-sm ${
                lvl.name === level
                  ? levelStyles[lvl.name]?.chip || ""
                  : "text-slate-muted bg-parchment"
              }`}
            >
              {lvl.name} · {lvl.min.toLocaleString()}+ XP
            </span>
          ))}
        </div>
      </div>

      {/* Transaction history */}
      <div>
        <p className="eyebrow mb-2">History</p>
        <h2 className="text-2xl mb-6">How you earned it</h2>
        {transactions.length === 0 ? (
          <p className="text-slate-muted">
            No rewards yet — verify your email, complete your profile, or save a
            property to start earning YC.
          </p>
        ) : (
          <div className="border border-navy/10 rounded-sm divide-y divide-navy/10 overflow-hidden">
            {transactions.map((txn) => (
              <div
                key={txn._id}
                className="flex items-center justify-between px-5 py-4 bg-white"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">
                    {actionIcon[txn.action] || "⭐"}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-navy">{txn.label}</p>
                    <p className="text-xs text-slate-muted">
                      {new Date(txn.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-brass">
                  +{txn.yc.toLocaleString()} YC
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Wallet;
