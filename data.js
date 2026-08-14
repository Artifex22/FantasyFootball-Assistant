(function () {
  "use strict";

  const ecrRows = [
    [1,1,"Jahmyr Gibbs","DET","RB1",1,5,2,0.9,1],
    [2,1,"Bijan Robinson","ATL","RB2",1,5,2.1,0.9,-1],
    [3,1,"Ja'Marr Chase","CIN","WR1",1,6,2.7,1.3,0],
    [4,1,"Puka Nacua","LAR","WR2",1,8,4.1,1.1,0],
    [5,1,"Jaxon Smith-Njigba","SEA","WR3",1,9,5.6,1.5,1],
    [6,1,"Amon-Ra St. Brown","DET","WR4",4,10,7.1,1.2,2],
    [7,1,"Christian McCaffrey","SF","RB3",3,22,7.5,3.4,-2],
    [8,2,"Jonathan Taylor","IND","RB4",3,19,9.4,3,-2],
    [9,2,"CeeDee Lamb","DAL","WR5",7,16,9.3,2.2,3],
    [10,2,"Justin Jefferson","MIN","WR6",6,30,10.3,3.4,2],
    [11,2,"James Cook III","BUF","RB5",5,23,11.3,3.2,-2],
    [12,2,"Ashton Jeanty","LV","RB6",6,30,14.7,5,-2],
    [13,2,"Drake London","ATL","WR7",9,28,15.4,4.5,4],
    [15,2,"A.J. Brown","NE","WR8",9,38,17.9,6.4,8],
    [14,2,"Chase Brown","CIN","RB7",10,37,18.3,5.5,-2],
    [17,2,"Brock Bowers","LV","TE1",11,32,18.2,4,4],
    [16,2,"Saquon Barkley","PHI","RB8",8,37,17.6,5.7,0],
    [18,3,"De'Von Achane","MIA","RB9",5,33,19,5.5,-5],
    [20,3,"Omarion Hampton","LAC","RB10",11,45,19.6,6.4,-4],
    [19,3,"Nico Collins","HOU","WR9",11,35,19.3,5.1,5],
    [21,3,"Derrick Henry","BAL","RB11",10,40,22.7,6.4,-1],
    [23,3,"George Pickens","DAL","WR10",11,41,22.3,5.4,5],
    [22,3,"Kenneth Walker III","KC","RB12",11,51,23,8.7,-4],
    [24,3,"Trey McBride","ARI","TE2",15,60,23.4,6.5,-6],
    [25,3,"Rashee Rice","KC","WR11",8,51,25.1,8.9,5],
    [26,3,"Chris Olave","NO","WR12",18,46,27.4,5.3,3],
    [27,3,"Josh Allen","BUF","QB1",22,44,27.6,4.7,-5],
    [28,3,"DeVonta Smith","PHI","WR13",16,48,29.8,6.5,5],
    [29,4,"Zay Flowers","BAL","WR14",11,51,33.1,8.1,11],
    [30,4,"Kyren Williams","LAR","RB13",15,51,35.5,7.7,-2],
    [31,4,"Tee Higgins","CIN","WR15",21,50,35.8,6.1,7],
    [32,4,"Jeremiyah Love","ARI","RB14",23,58,36,8.8,-7],
    [33,4,"Tetairoa McMillan","CAR","WR16",18,53,36.1,7.7,3],
    [34,4,"Lamar Jackson","BAL","QB2",25,62,36.9,10.5,1],
    [35,4,"Breece Hall","NYJ","RB15",24,60,37.8,6.8,-3],
    [36,4,"Emeka Egbuka","TB","WR17",18,54,38,7.5,6],
    [37,4,"Josh Jacobs","GB","RB16",17,60,38.3,9.1,-10],
    [38,4,"Garrett Wilson","NYJ","WR18",25,61,38.5,7.2,3],
    [39,4,"Malik Nabers","NYG","WR19",11,74,39.8,13.9,-2],
    [40,4,"Colston Loveland","CHI","TE3",22,76,39.9,12.6,3],
    [41,4,"Javonte Williams","DAL","RB17",19,55,40.1,8.7,-10],
    [42,4,"Ladd McConkey","LAC","WR20",17,64,40.5,8.6,3],
    [43,4,"Drake Maye","NE","QB3",27,73,41.3,12.5,7],
    [44,4,"Jaylen Waddle","DEN","WR21",25,68,42.1,8.8,5],
    [45,4,"Terry McLaurin","WAS","WR22",32,68,45.3,7.2,10],
    [46,4,"Joe Burrow","CIN","QB4",27,97,46.5,15.1,5],
    [47,4,"Travis Etienne Jr.","NO","RB18",20,76,47.2,9.4,-8],
    [48,4,"Davante Adams","LAR","WR23",33,75,47.5,6.5,9],
    [49,4,"Cam Skattebo","NYG","RB19",36,67,50.2,7.4,-15],
    [50,5,"Mike Evans","SF","WR24",32,83,51.1,8.9,11],
    [51,5,"Luther Burden III","CHI","WR25",38,93,51.4,9.3,-3],
    [52,5,"Jayden Daniels","WAS","QB5",29,90,54.4,13.7,8],
    [53,5,"Quinshon Judkins","CLE","RB20",25,71,54.4,8,-7],
    [54,5,"Jameson Williams","DET","WR26",39,87,54.9,9.4,5],
    [55,5,"Bucky Irving","TB","RB21",37,72,55.6,7.7,-11],
    [56,5,"Tyler Warren","IND","TE4",22,90,55.7,11.5,-2],
    [57,5,"D'Andre Swift","CHI","RB22",39,71,55.7,7.1,-1],
    [58,5,"Christian Watson","GB","WR27",39,89,56.8,10.8,8],
    [59,5,"David Montgomery","HOU","RB23",38,117,58.2,11.2,-7],
    [60,5,"Jalen Hurts","PHI","QB6",27,93,59.1,11.5,3],
    [61,5,"TreVeyon Henderson","NE","RB24",37,86,59.5,9,-14],
    [62,5,"DJ Moore","BUF","WR28",26,101,59.8,12.9,-9],
    [63,5,"Rome Odunze","CHI","WR29",38,89,60.5,10,1],
    [64,5,"Bhayshul Tuten","JAC","RB25",41,119,64.6,13.8,-6],
    [65,5,"Jadarian Price","SEA","RB26",40,117,68.4,10.7,-3],
    [66,5,"Tucker Kraft","GB","TE5",42,105,69.2,11.9,2],
    [67,5,"Caleb Williams","CHI","QB7",27,103,70.6,14,9],
    [68,5,"Carnell Tate","TEN","WR30",49,217,71.4,22.6,1],
    [69,5,"Justin Herbert","LAC","QB8",36,107,71.7,14.3,10],
    [70,5,"Jaylen Warren","PIT","RB27",57,92,73.2,7.6,-3],
    [71,5,"Marvin Harrison Jr.","ARI","WR31",47,115,74.1,12.6,4],
    [72,6,"Tony Pollard","TEN","RB28",57,99,77.3,9.6,8],
    [73,6,"Trevor Lawrence","JAC","QB9",58,104,77.7,11.7,13],
    [74,6,"Alec Pierce","IND","WR32",48,114,78.7,13.7,7],
    [75,6,"Brian Thomas Jr.","JAC","WR33",47,114,78.9,12.7,-4],
    [76,6,"Rhamondre Stevenson","NE","RB29",60,116,79.3,10,-2],
    [77,6,"Harold Fannin Jr.","CLE","TE6",56,113,79.4,11.7,-12],
    [78,6,"DK Metcalf","PIT","WR34",50,109,79.6,11.6,7],
    [79,6,"Dak Prescott","DAL","QB10",58,112,79.9,12.8,3],
    [80,6,"Chuba Hubbard","CAR","RB30",60,121,82.1,13.1,-8],
    [81,6,"Sam LaPorta","DET","TE7",56,105,82.4,8.8,-3],
    [82,6,"Parker Washington","JAC","WR35",54,136,82.7,16.1,8],
    [83,6,"Kyle Pitts Sr.","ATL","TE8",65,105,83,9,-13],
    [84,6,"Rico Dowdle","PIT","RB31",62,115,84.3,11.2,-7],
    [85,6,"Courtland Sutton","DEN","WR36",54,111,84.3,12.8,3],
    [86,6,"Chris Godwin Jr.","TB","WR37",59,120,85.6,11.8,5],
    [87,6,"Jordyn Tyson","NO","WR38",63,261,91.3,29.2,0],
    [88,6,"J.K. Dobbins","DEN","RB32",67,131,92.8,14.7,4],
    [89,6,"Jaxson Dart","NYG","QB11",56,121,92.9,14.3,-6],
    [90,6,"Brock Purdy","SF","QB12",62,132,93.5,12.2,10],
    [91,6,"Michael Wilson","ARI","WR39",61,135,94.1,13.8,-2],
    [92,6,"Michael Pittman Jr.","PIT","WR40",63,125,94.2,13,13],
    [93,6,"RJ Harvey","DEN","RB33",57,145,94.4,18.5,-20],
    [94,6,"Quentin Johnston","LAC","WR41",68,125,96,12.9,14],
    [95,6,"Kyle Monangai","CHI","RB34",72,126,96.2,11.6,-11],
    [96,6,"Blake Corum","LAR","RB35",71,129,98,12.4,-2],
    [97,6,"Patrick Mahomes II","KC","QB13",63,151,100.2,11.9,0],
    [98,6,"Makai Lemon","PHI","WR42",70,238,101.9,27.7,-5],
    [99,6,"Jakobi Meyers","JAC","WR43",70,146,102.4,15.2,8],
    [100,6,"Bo Nix","DEN","QB14",73,150,102.6,10.5,2],
    [97,6,"Josh Downs","IND","WR44",69,165,102.8,17.7,19],
    [102,6,"Travis Kelce","KC","TE9",76,156,103.2,14.4,-4],
    [103,6,"Kenny Gainwell","TB","RB36",76,147,103.3,15.2,1],
    [104,6,"Wan'Dale Robinson","TEN","WR45",61,149,103.5,16.5,12],
    [105,6,"George Kittle","SF","TE10",34,152,104.1,18.5,-10],
    [106,7,"Matthew Stafford","LAR","QB15",62,146,104.6,14.1,0],
    [107,7,"Jordan Addison","MIN","WR46",74,136,105.4,13,5],
    [108,7,"Rachaad White","WAS","RB37",71,151,105.6,16.1,3],
    [109,7,"Aaron Jones Sr.","MIN","RB38",79,134,109.8,13.6,4],
    [110,7,"Jared Goff","DET","QB16",62,161,110.2,13.4,7],
    [111,7,"Jayden Reed","GB","WR47",71,142,111,15.8,7],
    [112,7,"Dalton Kincaid","BUF","TE11",79,157,112.8,14.4,-11],
    [113,7,"Kyler Murray","MIN","QB17",73,206,114.4,17.5,14],
    [104,7,"Jonathon Brooks","CAR","RB39",66,366,114.5,41.5,-18],
    [110,7,"Jacory Croskey-Merritt","WAS","RB40",85,147,116.4,12,-5],
    [116,7,"Jake Ferguson","DAL","TE12",94,154,116.8,13.3,-7],
    [117,7,"Dallas Goedert","PHI","TE13",94,157,116.9,16.1,2],
    [118,7,"Jordan Mason","MIN","RB41",85,151,117.8,13.1,-3],
    [119,7,"Xavier Worthy","KC","WR48",82,149,121.2,14.1,5],
    [120,7,"Baker Mayfield","TB","QB18",100,160,121.5,11.2,14]
  ];

  const formatTopRanks = {
    standard: ["Jahmyr Gibbs","Bijan Robinson","Ja'Marr Chase","Puka Nacua","Jaxon Smith-Njigba","Amon-Ra St. Brown","Jonathan Taylor","Christian McCaffrey","CeeDee Lamb","James Cook III","Justin Jefferson","Nico Collins","Derrick Henry","Drake London","A.J. Brown","Brock Bowers","Saquon Barkley","Ashton Jeanty","George Pickens","Omarion Hampton","Trey McBride","Josh Allen","Kenneth Walker III","De'Von Achane"],
    ppr: ["Ja'Marr Chase","Puka Nacua","Bijan Robinson","Jahmyr Gibbs","Jaxon Smith-Njigba","Amon-Ra St. Brown","CeeDee Lamb","Christian McCaffrey","Justin Jefferson","Drake London","Jonathan Taylor","A.J. Brown","Nico Collins","Ashton Jeanty","George Pickens","Trey McBride","James Cook III","De'Von Achane","Chase Brown","Brock Bowers","Rashee Rice","Chris Olave","Omarion Hampton","DeVonta Smith"],
    half: ["Jahmyr Gibbs","Bijan Robinson","Ja'Marr Chase","Puka Nacua","Jaxon Smith-Njigba","Amon-Ra St. Brown","Christian McCaffrey","Jonathan Taylor","CeeDee Lamb","Justin Jefferson","James Cook III","Ashton Jeanty","Drake London","Chase Brown","A.J. Brown","Saquon Barkley","Brock Bowers","De'Von Achane","Nico Collins","Omarion Hampton","Derrick Henry","Kenneth Walker III","George Pickens","Trey McBride"]
  };

  const playerNotes = {
    "Bijan Robinson": "Elite rushing and receiving efficiency in 2025; the departure of Tyler Allgeier creates a plausible goal-line usage gain.",
    "Ja'Marr Chase": "Cleared a 30% target share and averaged 88.3 receiving yards per game in 2025.",
    "Puka Nacua": "Finished as 2025's fantasy WR1 and led wide receivers in yards per route run.",
    "Jaxon Smith-Njigba": "Converted 163 targets into nearly 1,800 yards and 10 touchdowns in his 2025 breakout.",
    "Amon-Ra St. Brown": "A top-three fantasy receiver for three straight seasons with league-leading red-zone usage in 2025.",
    "Christian McCaffrey": "Led the NFL with 413 touches and a 21.3% target share, but several rushing-efficiency indicators declined.",
    "Josh Allen": "Rushing remains the anchor: 579 yards and 14 scores on the ground in 2025.",
    "Lamar Jackson": "Injuries and a sharp drop in rushing volume drove a QB20 finish in 2025; rebound depends on health and a new coordinator.",
    "Drake Maye": "Finished QB2 in 2025 while pairing elite passing efficiency with 450 rushing yards.",
    "Tucker Kraft": "Returning from ACL and meniscus injuries after posting 2.33 yards per route run before the injury."
  };

  const rookieNames = new Set([
    "Jeremiyah Love", "Carnell Tate", "Jadarian Price", "Jordyn Tyson", "Makai Lemon",
    "Kenyon Sadiq", "KC Concepcion", "Denzel Boston", "De'Zhaun Stribling", "Germie Bernard",
    "Antonio Williams", "Mike Washington Jr.", "Omar Cooper Jr.", "Zachariah Branch", "Jonah Coleman",
    "Kaelon Black", "Kaytron Allen", "Fernando Mendoza", "Nicholas Singleton", "Demond Claiborne",
    "Caleb Douglas", "Ja'Kobi Lane", "Ted Hurst", "Ted Hurst III", "Adam Randall", "Emmett Johnson",
    "Elijah Sarratt", "Seth McGowan", "Chris Bell", "Trevor Etienne", "CJ Daniels", "Malachi Fields", "Chris Brazzell II",
    "Matthew Hibner", "Eli Stowers", "Cade Klubnik", "Carson Beck", "Drew Allar"
  ]);

  const deepRookies = [
    ["Elijah Sarratt", "BAL", "WR", 9],
    ["CJ Daniels", "LAR", "WR", 10],
    ["Malachi Fields", "NYG", "WR", 11],
    ["Chris Brazzell II", "CAR", "WR", 12],
    ["Matthew Hibner", "BAL", "TE", 2],
    ["Eli Stowers", "PHI", "TE", 3],
    ["Cade Klubnik", "NYJ", "QB", 2],
    ["Carson Beck", "ARI", "QB", 3],
    ["Drew Allar", "PIT", "QB", 4]
  ];

  const sourceVerdicts = [
    {
      name: "FantasyPros accuracy framework",
      verdict: "Primary benchmark",
      tone: "strong",
      evidence: "Final preseason snapshots; half-PPR; 212 experts in 2025",
      conclusion: "Use for same-season expert comparisons. Do not compare retired PAY% scores directly with the current Accuracy Gap method.",
      url: "https://www.fantasypros.com/about/faq/football-draft-accuracy-methodology/"
    },
    {
      name: "Pat Fitzmaurice",
      verdict: "Moderate-positive",
      tone: "strong",
      evidence: "47th of 212 in 2025; 36th in 2023–2025; TE rank 14",
      conclusion: "Above the 2025 median with a better multi-year tight-end record. Useful as one voice, not a standalone oracle.",
      url: "https://www.fantasypros.com/nfl/accuracy/multi-year-draft.php"
    },
    {
      name: "Matt Harmon / Reception Perception",
      verdict: "WR specialist lens",
      tone: "strong",
      evidence: "Public 2026 dissent ranks plus validated man/zone separation methodology",
      conclusion: "Use Harmon's route-winning and alignment work to challenge WR assumptions. His 2023-2025 overall accuracy placement was 117th, so the app exposes his dissent instead of granting a hidden brand bonus.",
      url: "https://receptionperception.com/assessing-the-effect-of-reception-perception-success-rates-and-alignment-on-statistical-production/"
    },
    {
      name: "Accuracy-weighted cohort",
      verdict: "Priority expansion",
      tone: "strong",
      evidence: "2023-2025 top five: Jody Smith, Sean Koerner, Joey Wright, Jeff Ratcliffe, Dave Kluge",
      conclusion: "These are the best next complete ranking feeds to freeze and compare. Multi-year performance is more stable evidence than one hot season.",
      url: "https://www.fantasypros.com/2026/07/2025s-most-accurate-fantasy-football-draft-rankings/"
    },
    {
      name: "Position accuracy leaders",
      verdict: "Targeted specialists",
      tone: "neutral",
      evidence: "2025: Justin Elick QB, Jason Willan RB, Seth Miller WR, Matthew Mutchler TE",
      conclusion: "Position leaders should inform disagreement flags by position, but only after their final preseason ranks are frozen in the same scoring format.",
      url: "https://www.fantasypros.com/2026/07/2025s-most-accurate-fantasy-football-draft-rankings/"
    },
    {
      name: "Yahoo named analysts",
      verdict: "Mixed evidence",
      tone: "caution",
      evidence: "2025: Pianowski 108, Boone 114, Harmon 176 of 212",
      conclusion: "Results vary materially by analyst and position. No brand-level accuracy bonus is justified.",
      url: "https://www.fantasypros.com/nfl/accuracy/draft.php?sort=WR"
    },
    {
      name: "ESPN / Mike Clay",
      verdict: "Distinct second opinion",
      tone: "neutral",
      evidence: "Public 2026 PPR Top 300; updated Aug 9",
      conclusion: "Strong complete ranking baseline, but no comparable public 2025 half-PPR accuracy placement was verified in this research pass.",
      url: "https://g.espncdn.com/s/ffldraftkit/26/NFL26_CS_PPR300.pdf?adddata=2026CS_PPR300"
    },
    {
      name: "The Fantasy Footballers",
      verdict: "Qualitative only",
      tone: "neutral",
      evidence: "Selected historical placements; no recent full contest dataset",
      conclusion: "Useful for contemporaneous reasoning and archived takes. Their public history is not a complete reproducible accuracy series.",
      url: "https://www.thefantasyfootballers.com/accuracy/"
    },
    {
      name: "Sleeper",
      verdict: "Market signal",
      tone: "neutral",
      evidence: "Platform ADP, mocks, tiers, and retrospectives",
      conclusion: "Treat Sleeper as market and platform data, not as a single analyst with a public accuracy score.",
      url: "https://sleeper.com/blog/fantasy-football-rb-tier-based-rankings-2024/"
    }
  ];

  const researchLedger = [
    {source:"FantasyPros",artifact:"2026 half-PPR ECR refresh",date:"Retrieved 2026-08-14; complete current top 24",url:"https://www.fantasypros.com/nfl/cheatsheets/top-half-ppr-players.php"},
    {source:"ESPN",artifact:"2026 PPR Top 300 cheat sheet",date:"Updated 2026-08-13; complete Top 300 transcribed",url:"https://g.espncdn.com/s/ffldraftkit/26/NFL26_CS_PPR300.pdf?adddata=2026CS_PPR300"},
    {source:"RotoBaller",artifact:"2026 rookie redraft rankings",date:"Published 2026-06-05",url:"https://www.rotoballer.com/fantasy-football-rookie-rankings-for-redraft-leagues-2026/1869301"},
    {source:"Athlon",artifact:"2026 rookie position rankings",date:"Published 2026-04-28",url:"https://athlonsports.com/fantasy/2026-fantasy-football-rookie-rankings-redraft-keeper-leagues"},
    {source:"FantasyPros",artifact:"2025 draft accuracy results",date:"2025 season",url:"https://www.fantasypros.com/nfl/accuracy/draft.php?sort=WR"},
    {source:"FantasyPros",artifact:"2023–2025 multi-year accuracy",date:"Published 2026-07",url:"https://www.fantasypros.com/nfl/accuracy/multi-year-draft.php"},
    {source:"FantasyPros",artifact:"Draft accuracy methodology",date:"Undated evergreen",url:"https://www.fantasypros.com/about/faq/football-draft-accuracy-methodology/"},
    {source:"Reception Perception",artifact:"Success rate and alignment validation",date:"Public methodology",url:"https://receptionperception.com/assessing-the-effect-of-reception-perception-success-rates-and-alignment-on-statistical-production/"},
    {source:"FantasyPros",artifact:"Matt Harmon 2026 PPR dissent ranks",date:"Verified unchanged 2026-08-10",url:"https://www.fantasypros.com/nfl/rankings/matt-harmon-consensus-rankings.php?scoring=PPR"},
    {source:"FantasyPros",artifact:"Pat Fitzmaurice 2026 half-PPR dissent ranks",date:"Updated 2026-08-10",url:"https://www.fantasypros.com/nfl/rankings/pat-fitzmaurice-consensus-rankings.php?scoring=HALF"},
    {source:"FantasyPros",artifact:"Yahoo, Sleeper and RTSports half-PPR ADP",date:"Retrieved 2026-08-10",url:"https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php"},
    {source:"FantasyPros",artifact:"2025 accuracy analysis and position leaders",date:"Published 2026-07",url:"https://www.fantasypros.com/2026/07/2025s-most-accurate-fantasy-football-draft-rankings/"},
    {source:"Research",artifact:"Expected points and replacement value",date:"JQAS 2020",url:"https://doi.org/10.1515/jqas-2018-0010"},
    {source:"NFL",artifact:"Next Gen Stats methodology",date:"Current reference",url:"https://operations.nfl.com/game-operations-logistics/technology/performance-tracking-data-next-gen-stats"}
  ];

  const positionOf = (positionRank) => positionRank.replace(/[0-9]/g, "");
  const positionNumber = (positionRank) => Number(positionRank.replace(/\D/g, ""));
  const idFor = (name) => name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const nameKey = (name) => idFor(name).replace(/-(jr|sr|ii|iii)$/, "");
  const formatMaps = Object.fromEntries(Object.entries(formatTopRanks).map(([format, names]) => [format, Object.fromEntries(names.map((name, index) => [nameKey(name), index + 1]))]));
  const ecrByName = new Map(ecrRows.map((row) => [nameKey(row[2]), row]));

  const players = (window.ESPN_TOP_300 || []).map(([rank,name,team,position,positionRank]) => {
    const ecr = ecrByName.get(nameKey(name));
    return Object.freeze({
      id: idFor(name),
      rank,
      ecrRank: ecr ? ecr[0] : null,
      tier: ecr ? ecr[1] : Math.ceil(rank / 18),
      name,
      team,
      position,
      positionRank,
      ecrPositionRank: ecr ? positionNumber(ecr[4]) : null,
      best: ecr ? ecr[5] : null,
      worst: ecr ? ecr[6] : null,
      average: ecr ? ecr[7] : null,
      stdDev: ecr ? ecr[8] : null,
      ecrVsAdp: ecr ? ecr[9] : 0,
      formatRanks: Object.freeze({standard: formatMaps.standard[nameKey(name)] || null, ppr: formatMaps.ppr[nameKey(name)] || null, half: formatMaps.half[nameKey(name)] || null}),
      espnOverallRank: rank,
      espnPositionRank: positionRank,
      rankingSource: ecr ? "ESPN + FantasyPros" : "ESPN PPR Top 300",
      isRookie: rookieNames.has(name),
      note: playerNotes[name] || null
    });
  });

  const maxPositionRank = Object.fromEntries(["QB", "RB", "WR", "TE"].map((position) => [position, Math.max(...players.filter((player) => player.position === position).map((player) => player.positionRank))]));
  deepRookies.forEach(([name,team,position,rookiePositionRank], index) => {
    maxPositionRank[position] += 1;
    players.push(Object.freeze({
      id: idFor(name), rank: 301 + index, ecrRank: null, tier: 18, name, team, position,
      positionRank: maxPositionRank[position], ecrPositionRank: null, best: null, worst: null, average: null, stdDev: null,
      ecrVsAdp: 0, formatRanks: Object.freeze({standard: null, ppr: null, half: null}),
      espnOverallRank: null, espnPositionRank: null, rankingSource: "Athlon rookie watch list",
      isRookie: true, rookiePositionRank, note: null
    }));
  });

  window.DRAFT_DATA = Object.freeze({
    asOf: "2026-08-14",
    players: Object.freeze(players),
    sourceVerdicts: Object.freeze(sourceVerdicts),
    researchLedger: Object.freeze(researchLedger),
    defaultWeights: Object.freeze({
      consensus: 35,
      projectionVor: 28,
      opportunity: 17,
      schedule: 3,
      durability: 10,
      market: 7
    })
  });
})();
