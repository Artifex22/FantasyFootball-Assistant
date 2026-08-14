(function () {
  "use strict";

  window.RANKING_COMPARISON_DATA = Object.freeze({
    asOf: "2026-08-14",
    sources: Object.freeze({
      market: Object.freeze({
        id: "market",
        name: "Platform ADP composite",
        shortName: "ADP",
        format: "Half PPR",
        coverage: "Dated local matches through Aug 10",
        note: "FantasyPros composite of Yahoo, Sleeper, and RTSports half-PPR ADP as of August 10. This is market behavior, not an expert projection.",
        url: "https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php"
      }),
      espn: Object.freeze({
        id: "espn",
        name: "ESPN draft rankings",
        shortName: "ESPN",
        format: "PPR",
        coverage: "Top 300",
        note: "ESPN's complete August 13 PPR Top 300. League scoring is half PPR, so small WR/RB differences should be interpreted directionally.",
        url: "https://g.espncdn.com/s/ffldraftkit/26/NFL26_CS_PPR300.pdf?adddata=2026CS_PPR300",
        ranks: Object.freeze({})
      }),
      fantasypros: Object.freeze({
        id: "fantasypros",
        name: "FantasyPros ECR",
        shortName: "ECR",
        format: "Half PPR",
        coverage: "Full top 24 plus verified material movers",
        note: "August 14 half-PPR consensus refresh. The full top 24 is current; deeper local ECR rows retain their dated snapshot rather than being guessed.",
        url: "https://www.fantasypros.com/nfl/rankings/?scoring=HALF&type=draft"
      }),
      yahoo: Object.freeze({
        id: "yahoo",
        name: "Yahoo ADP",
        shortName: "Yahoo",
        format: "Half PPR",
        coverage: "Publicly verified sample; paste a board to expand",
        note: "Dated Yahoo draft-market positions exposed in public ADP references. Missing players remain N/A rather than being estimated.",
        url: "https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php",
        ranks: Object.freeze({"bijan-robinson":1,"jahmyr-gibbs":2,"ja-marr-chase":3,"puka-nacua":4,"christian-mccaffrey":5,"a-j-brown":26,"jaylen-waddle":46,"emeka-egbuka":47})
      }),
      sleeper: Object.freeze({
        id: "sleeper",
        name: "Sleeper ADP",
        shortName: "Sleeper",
        format: "Half PPR",
        coverage: "Publicly verified sample; paste a board to expand",
        note: "Dated Sleeper draft-market positions exposed in public ADP references. Missing players remain N/A rather than being estimated.",
        url: "https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php",
        ranks: Object.freeze({"bijan-robinson":1,"jahmyr-gibbs":2,"ja-marr-chase":3,"puka-nacua":4,"christian-mccaffrey":5,"a-j-brown":34,"jaylen-waddle":43,"emeka-egbuka":57})
      }),
      harmon: Object.freeze({
        id: "harmon",
        name: "Matt Harmon",
        shortName: "Harmon",
        format: "PPR",
        coverage: "Public material-difference sample",
        note: "Public 2026 Yahoo/Reception Perception ranks where Harmon's board materially differs from ECR. Use as a WR talent/dissent lens, not a complete half-PPR market board.",
        url: "https://www.fantasypros.com/nfl/rankings/matt-harmon-consensus-rankings.php?scoring=PPR",
        ranks: Object.freeze({
          "jaylen-waddle":18,"tee-higgins":19,"joe-burrow":30,"a-j-brown":36,"jayden-daniels":37,"rashee-rice":38,"tetairoa-mcmillan":44,"d-andre-swift":47,"drake-maye":54,"cam-skattebo":65,"josh-downs":71,"sam-laporta":73,"michael-wilson":76,"jaxson-dart":79,"jadarian-price":84,"harold-fannin-jr":85,"jonathon-brooks":86,"jayden-reed":88,"j-k-dobbins":89,"chris-godwin-jr":91,"isaiah-likely":106,"romeo-doubs":107,"mark-andrews":111,"kc-concepcion":116,"de-zhaun-stribling":128,"jalen-mcmillan":133,"daniel-jones":134,"jaylin-noel":140,"jonah-coleman":141,"travis-hunter":149,"ryan-flournoy":150,"denver-broncos":151,"kaytron-allen":162,"jalen-nailor":166,"new-england-patriots":167,"calvin-ridley":168,"baltimore-ravens":172,"greg-dulcich":173,"isaac-teslaa":174,"emmett-johnson":175,"jack-bech":176,"mike-washington-jr":177,"aaron-rodgers":179,"nicholas-singleton":182,"kansas-city-chiefs":183,"buffalo-bills":190,"green-bay-packers":191
        })
      }),
      fitzmaurice: Object.freeze({
        id: "fitzmaurice",
        name: "Pat Fitzmaurice",
        shortName: "Fitz",
        format: "Half PPR",
        coverage: "Public material-difference sample",
        note: "August 10 expert ranks exposed where the current board adds useful dissent. Missing players remain N/A and are not estimated.",
        url: "https://www.fantasypros.com/nfl/rankings/pat-fitzmaurice-consensus-rankings.php?scoring=HALF",
        ranks: Object.freeze({
          "jaylen-waddle":31,"tyler-warren":41,"sam-laporta":65,"kyle-pitts-sr":66,"josh-downs":78,"makai-lemon":80,"jonathon-brooks":86,"jacory-croskey-merritt":97,"stefon-diggs":101
        })
      })
    })
  });
})();
