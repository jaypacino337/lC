// Lines inside signed Arena / Company messages (the server checks the exact same text)
export const TITLE_ACK = "Stake: the winner takes the loser's builder, its SOL and its coin";
export const duelLine = (stake, hours, target) => `Duel: ${stake} ${hours}h vs ${target || 'open'}`;
export const duelNoLine = (no) => `Duel: #${no}`;
export const companyLine = (tag) => `Company: ${tag}`;
export const newCompanyLine = (name, tag) => `Company: ${name} [${tag}]`;
export const joinLine = (type, league) => `Join: ${type === 'league' ? 'league:' + league : type}`;
