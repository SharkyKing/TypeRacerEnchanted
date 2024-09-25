module.exports = (sequelize, DataTypes) => {
  const Game = sequelize.define("Game", {
    words: {
      type: DataTypes.STRING, // Storing array as JSON in SQL Server
      allowNull: false,
    },
    isOpen: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isOver: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    startTime: {
      type: DataTypes.BIGINT, // If storing Unix timestamp
      allowNull: true,
    }
  });

  Game.associate = (models) => {
    Game.hasMany(models.Player, {
      foreignKey: 'gameId',
      as: 'players',
    });
  };

  return Game;
};